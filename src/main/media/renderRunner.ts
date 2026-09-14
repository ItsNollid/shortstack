// Runs ffprobe and ffmpeg to make the file TikTok and Instagram get. Kept apart from the arguments, which are
// pure and tested on their own, because this part needs the tools on the computer and real files.
//
// A render is kept beside the stills and reused while the source file is unchanged: measured, a 17-second
// clip took 10 seconds to encode, which is fine once and wasteful on every retry.
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { hasEditLists, indexBeforeData, readTopLevelBoxes } from './mp4Layout';
import { parseProbe, problemsFor, renderArgs, type MediaInfo, type PostPlatform } from './platformRender';

export interface Tools {
  ffmpeg: string;
  ffprobe: string;
}

export type RunTool = (file: string, args: readonly string[], timeoutMs: number) => Promise<string>;

const exe = (name: string, platform: NodeJS.Platform): string => (platform === 'win32' ? `${name}.exe` : name);

const defaultExists = async (candidate: string): Promise<boolean> =>
  fs.access(candidate).then(
    () => true,
    () => false
  );

/**
 * Where ffmpeg is looked for: everywhere on PATH, then the usual places a Windows install ends up when it is
 * not on PATH for this process — a manual install in C:\ffmpeg, and winget's links.
 */
export function toolFolders(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string[] {
  const onPath = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter((entry) => entry.trim() !== '');
  const windows =
    platform === 'win32'
      ? ['C:\\ffmpeg\\bin', ...(env.LOCALAPPDATA === undefined ? [] : [path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links')])]
      : [];
  return [...new Set([...onPath, ...windows])];
}

/** The first folder holding both tools, or null when ffmpeg is not installed where it can be found. */
export async function findTools(
  env: NodeJS.ProcessEnv = process.env,
  exists: (candidate: string) => Promise<boolean> = defaultExists,
  platform: NodeJS.Platform = process.platform
): Promise<Tools | null> {
  for (const folder of toolFolders(env, platform)) {
    const ffmpeg = path.join(folder, exe('ffmpeg', platform));
    const ffprobe = path.join(folder, exe('ffprobe', platform));
    if ((await exists(ffmpeg)) && (await exists(ffprobe))) return { ffmpeg, ffprobe };
  }
  return null;
}

const lastLine = (text: string): string =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .pop() ?? '';

export const runTool: RunTool = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error === null) resolve(stdout);
      else reject(new Error(lastLine(String(stderr)) || error.message));
    });
  });

export async function probeFile(tools: Tools, filePath: string, run: RunTool = runTool): Promise<MediaInfo | null> {
  try {
    const output = await run(tools.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath], 30_000);
    return parseProbe(JSON.parse(output));
  } catch {
    return null;
  }
}

export interface RenderDeps {
  tools: Tools;
  /** Where renders are kept. */
  dir: string;
  run?: RunTool;
}

export interface RenderSource {
  videoId: number;
  filePath: string;
}

export type RenderResult =
  | { ok: true; path: string; info: MediaInfo; problems: Record<PostPlatform, string[]>; reused: boolean }
  | { ok: false; reason: string };

interface RenderMeta {
  sourceSize: number;
  sourceMtimeMs: number;
}

export const renderPath = (dir: string, videoId: number): string => path.join(dir, `${videoId}.mp4`);
const metaPath = (dir: string, videoId: number): string => path.join(dir, `${videoId}.json`);

async function readMeta(dir: string, videoId: number): Promise<RenderMeta | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(metaPath(dir, videoId), 'utf8')) as Partial<RenderMeta>;
    return typeof parsed.sourceSize === 'number' && typeof parsed.sourceMtimeMs === 'number'
      ? { sourceSize: parsed.sourceSize, sourceMtimeMs: parsed.sourceMtimeMs }
      : null;
  } catch {
    return null;
  }
}

/** What the platforms would say about a finished render, including the layout rules ffprobe cannot see. */
async function check(filePath: string, info: MediaInfo): Promise<Record<PostPlatform, string[]>> {
  const top = await readTopLevelBoxes(filePath);
  const layout: string[] = [];
  if (!indexBeforeData(top)) layout.push('The index is not at the front of the file.');
  if ((await hasEditLists(filePath, top)) === true) layout.push('The file has edit lists.');
  return { tiktok: problemsFor(info, 'tiktok'), instagram: [...problemsFor(info, 'instagram'), ...layout] };
}

const inFlight = new Map<number, Promise<RenderResult>>();

/** One render per video at a time: a second request for the same video waits for the first. */
export function renderForPlatforms(deps: RenderDeps, source: RenderSource): Promise<RenderResult> {
  const running = inFlight.get(source.videoId);
  if (running !== undefined) return running;
  const started = render(deps, source).finally(() => inFlight.delete(source.videoId));
  inFlight.set(source.videoId, started);
  return started;
}

async function render(deps: RenderDeps, source: RenderSource): Promise<RenderResult> {
  const run = deps.run ?? runTool;
  const stat = await fs.stat(source.filePath).catch(() => null);
  if (stat === null) return { ok: false, reason: 'The video file is not where it was' };

  const output = renderPath(deps.dir, source.videoId);
  const meta = await readMeta(deps.dir, source.videoId);
  if (meta !== null && meta.sourceSize === stat.size && meta.sourceMtimeMs === stat.mtimeMs) {
    const kept = await fs.stat(output).catch(() => null);
    const info = kept === null ? null : await probeFile(deps.tools, output, run);
    if (info !== null) return { ok: true, path: output, info, problems: await check(output, info), reused: true };
  }

  const sourceInfo = await probeFile(deps.tools, source.filePath, run);
  if (sourceInfo === null || sourceInfo.video === null) return { ok: false, reason: 'ffprobe could not read the video' };

  await fs.mkdir(deps.dir, { recursive: true });
  const partial = `${output}.part`;
  // Twenty seconds for every second of video, and never less than two minutes: measured at well under one.
  const timeoutMs = Math.max(120_000, Math.ceil((sourceInfo.durationSeconds ?? 60) * 20_000));
  try {
    await run(deps.tools.ffmpeg, renderArgs(source.filePath, partial, sourceInfo), timeoutMs);
    await fs.rm(output, { force: true });
    await fs.rename(partial, output);
  } catch (error) {
    await fs.rm(partial, { force: true }).catch(() => undefined);
    return { ok: false, reason: `ffmpeg could not make the file: ${error instanceof Error ? error.message : String(error)}` };
  }
  await fs.writeFile(metaPath(deps.dir, source.videoId), JSON.stringify({ sourceSize: stat.size, sourceMtimeMs: stat.mtimeMs }));

  const info = await probeFile(deps.tools, output, run);
  if (info === null) return { ok: false, reason: 'ffprobe could not read the finished file' };
  return { ok: true, path: output, info, problems: await check(output, info), reused: false };
}
