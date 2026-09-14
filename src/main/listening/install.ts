// Where listening's downloads live, and putting them there. Everything sits under the app's own data folder:
//   listening/engines/cpu   the unpacked whisper.cpp build for the processor
//   listening/engines/gpu   the one for NVIDIA cards
//   listening/models        the model files
// A download becomes "installed" only after it matched its published checksum and, for an engine, unpacked into
// something that can run.
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ENGINES, ENGINE_RELEASE, MODELS, findModel, modelUrl, type EngineKind, type ModelDownload } from '../../shared/listening';
import { downloadVerified, type DownloadOptions } from './downloads';

export const enginesDir = (root: string): string => path.join(root, 'engines');
export const modelsDir = (root: string): string => path.join(root, 'models');
const downloadsDir = (root: string): string => path.join(root, 'downloads');
const engineMeta = (root: string, kind: EngineKind): string => path.join(enginesDir(root), kind, 'installed.json');
const modelsMeta = (root: string): string => path.join(modelsDir(root), 'installed.json');
export const modelPath = (root: string, model: ModelDownload): string => path.join(modelsDir(root), model.file);

export type Extract = (zipPath: string, destDir: string) => Promise<void>;

/** Windows 10 and later ship bsdtar as tar.exe, which unpacks zip files: no unzip library to add. */
export const extractWithTar: Extract = (zipPath, destDir) =>
  new Promise((resolve, reject) => {
    execFile('tar', ['-xf', zipPath, '-C', destDir], { windowsHide: true, timeout: 5 * 60_000 }, (error) => (error === null ? resolve() : reject(error)));
  });

export interface InstalledEngine {
  kind: EngineKind;
  cliPath: string;
  release: string;
}

export interface InstalledState {
  engines: Partial<Record<EngineKind, InstalledEngine>>;
  /** Catalog ids of the models present and verified. */
  models: string[];
}

const exists = (file: string): Promise<boolean> =>
  fs.access(file).then(
    () => true,
    () => false
  );

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function readInstalled(root: string): Promise<InstalledState> {
  const engines: InstalledState['engines'] = {};
  for (const kind of Object.keys(ENGINES) as EngineKind[]) {
    const meta = await readJson<{ release?: unknown; cli?: unknown }>(engineMeta(root, kind));
    if (meta === null || typeof meta.cli !== 'string' || typeof meta.release !== 'string') continue;
    const cliPath = path.join(enginesDir(root), kind, meta.cli);
    if (await exists(cliPath)) engines[kind] = { kind, cliPath, release: meta.release };
  }

  const verified = (await readJson<{ ids?: unknown }>(modelsMeta(root)))?.ids;
  const ids = Array.isArray(verified) ? verified.filter((id): id is string => typeof id === 'string') : [];
  const models: string[] = [];
  for (const model of MODELS) {
    if (ids.includes(model.id) && (await exists(modelPath(root, model)))) models.push(model.id);
  }
  return { engines, models };
}

async function findFile(dir: string, name: string, depth = 4): Promise<string | null> {
  let entries: Array<import('fs').Dirent>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const direct = entries.find((entry) => entry.isFile() && entry.name.toLowerCase() === name.toLowerCase());
  if (direct !== undefined) return path.join(dir, direct.name);
  if (depth === 0) return null;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findFile(path.join(dir, entry.name), name, depth - 1);
    if (found !== null) return found;
  }
  return null;
}

export interface InstallDeps {
  root: string;
  download?: typeof downloadVerified;
  extract?: Extract;
  signal?: AbortSignal;
  onProgress?: DownloadOptions['onProgress'];
}

export type InstallResult<T> = { ok: true; value: T } | { ok: false; reason: string; cancelled?: boolean };

export async function installEngine(deps: InstallDeps, kind: EngineKind): Promise<InstallResult<InstalledEngine>> {
  const item = ENGINES[kind];
  const download = deps.download ?? downloadVerified;
  const extract = deps.extract ?? extractWithTar;
  const zip = path.join(downloadsDir(deps.root), item.file);

  const fetched = await download({ url: item.url, bytes: item.bytes, sha256: item.sha256, dest: zip }, { signal: deps.signal, onProgress: deps.onProgress });
  if (!fetched.ok) return { ok: false, reason: fetched.reason, cancelled: fetched.code === 'cancelled' };

  const target = path.join(enginesDir(deps.root), kind);
  const staging = `${target}.new`;
  const fail = async (reason: string): Promise<InstallResult<InstalledEngine>> => {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return { ok: false, reason };
  };

  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  try {
    await extract(zip, staging);
  } catch (error) {
    return fail(`Could not unpack it: ${error instanceof Error ? error.message : String(error)}`);
  }

  const cli = await findFile(staging, 'whisper-cli.exe');
  if (cli === null) return fail('The download has no whisper-cli.exe in it');
  if (kind === 'gpu') {
    // Measured: the CUDA 11.8 build left out cublas64_11.dll and, without it, silently ran on the processor.
    const beside = await fs.readdir(path.dirname(cli));
    if (!beside.some((name) => /^cublas64_\d+\.dll$/i.test(name))) {
      return fail('This graphics card build is missing NVIDIA’s cuBLAS library, so it would only run on the processor');
    }
  }

  await fs.rm(target, { recursive: true, force: true });
  await fs.rename(staging, target);
  const relative = path.relative(staging, cli);
  await fs.writeFile(engineMeta(deps.root, kind), JSON.stringify({ release: ENGINE_RELEASE, cli: relative }));
  // Unpacked, the zip is only taking up space.
  await fs.rm(zip, { force: true }).catch(() => undefined);
  return { ok: true, value: { kind, cliPath: path.join(target, relative), release: ENGINE_RELEASE } };
}

async function writeModelIds(root: string, change: (ids: string[]) => string[]): Promise<void> {
  const current = (await readJson<{ ids?: unknown }>(modelsMeta(root)))?.ids;
  const ids = Array.isArray(current) ? current.filter((id): id is string => typeof id === 'string') : [];
  await fs.mkdir(modelsDir(root), { recursive: true });
  await fs.writeFile(modelsMeta(root), JSON.stringify({ ids: [...new Set(change(ids))] }));
}

export async function installModel(deps: InstallDeps, id: string): Promise<InstallResult<string>> {
  const model = findModel(id);
  if (model === undefined) return { ok: false, reason: 'That is not one of the models ShortStack offers' };
  const download = deps.download ?? downloadVerified;
  const dest = modelPath(deps.root, model);
  const fetched = await download({ url: modelUrl(model), bytes: model.bytes, sha256: model.sha256, dest }, { signal: deps.signal, onProgress: deps.onProgress });
  if (!fetched.ok) return { ok: false, reason: fetched.reason, cancelled: fetched.code === 'cancelled' };
  await writeModelIds(deps.root, (ids) => [...ids, model.id]);
  return { ok: true, value: dest };
}

export async function removeModel(root: string, id: string): Promise<void> {
  const model = findModel(id);
  if (model === undefined) return;
  await writeModelIds(root, (ids) => ids.filter((each) => each !== id));
  await fs.rm(modelPath(root, model), { force: true });
}

export async function removeEngine(root: string, kind: EngineKind): Promise<void> {
  await fs.rm(path.join(enginesDir(root), kind), { recursive: true, force: true });
}

/**
 * A model file already on this computer, such as the one another whisper app downloaded. Only a ggml .bin of a
 * plausible size is accepted; whether it runs is found out the first time it listens.
 */
export async function checkModelFile(filePath: string): Promise<{ ok: true; englishOnly: boolean } | { ok: false; reason: string }> {
  if (!/^ggml-.+\.bin$/i.test(path.basename(filePath))) return { ok: false, reason: 'Choose a whisper.cpp model file, named like ggml-small.en.bin' };
  const stat = await fs.stat(filePath).catch(() => null);
  if (stat === null || !stat.isFile()) return { ok: false, reason: 'That file is not there' };
  if (stat.size < 10_000_000) return { ok: false, reason: 'That file is too small to be a model' };
  return { ok: true, englishOnly: /\.en[.-]/i.test(path.basename(filePath)) };
}
