// Listens to one video: its sound pulled out with ffmpeg at the rate whisper expects, whisper.cpp run over it, and
// the JSON it writes read back. Nothing leaves the computer.
import { execFile } from 'child_process';
import { randomBytes } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { backendFromLog, parseWhisperJson, type Backend, type TranscriptSegment } from '../../shared/transcript';
import type { Tools } from '../media/renderRunner';

export type RunCapture = (file: string, args: readonly string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string }>;

export const runCapture: RunCapture = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error === null) resolve({ stdout: String(stdout), stderr: String(stderr) });
      else reject(Object.assign(new Error(String(stderr).trim().split(/\r?\n/).pop() || error.message), { stderr: String(stderr) }));
    });
  });

/** Mono, 16 kHz, 16-bit: what whisper.cpp reads. The first sound track only. */
export const audioArgs = (input: string, output: string): string[] => [
  '-hide_banner',
  '-nostdin',
  '-y',
  '-i',
  input,
  '-vn',
  '-map',
  '0:a:0',
  '-ac',
  '1',
  '-ar',
  '16000',
  '-c:a',
  'pcm_s16le',
  output
];

export interface WhisperRun {
  modelPath: string;
  audioPath: string;
  /** Where the JSON goes, without its extension. */
  outputBase: string;
  englishOnly: boolean;
  threads: number;
}

/**
 * Not with -np: it silences the loading log too, and that log is the only place whisper.cpp says whether it found
 * the graphics card. Measured: one build quietly ran on the processor, and only the log said so.
 */
export const whisperArgs = (run: WhisperRun): string[] => [
  '-m',
  run.modelPath,
  '-f',
  run.audioPath,
  '-l',
  run.englishOnly ? 'en' : 'auto',
  '-t',
  String(run.threads),
  '-oj',
  '-of',
  run.outputBase
];

export interface TranscribeDeps {
  tools: Tools;
  cliPath: string;
  modelPath: string;
  englishOnly: boolean;
  /** Scratch space for the audio and the JSON, both removed afterwards. */
  workDir: string;
  run?: RunCapture;
  now?: () => number;
}

export type TranscribeResult =
  | { ok: true; segments: TranscriptSegment[]; backend: Backend; elapsedMs: number }
  | { ok: false; reason: string };

/** Ten minutes: measured at 25 seconds for a 17-second clip on the processor with the medium model. */
const LISTEN_TIMEOUT_MS = 10 * 60_000;

export async function transcribeFile(deps: TranscribeDeps, filePath: string): Promise<TranscribeResult> {
  const run = deps.run ?? runCapture;
  const now = deps.now ?? Date.now;
  const started = now();
  await fs.mkdir(deps.workDir, { recursive: true });
  const base = path.join(deps.workDir, `listen-${randomBytes(6).toString('hex')}`);
  const audioPath = `${base}.wav`;
  const jsonPath = `${base}.json`;

  try {
    try {
      await run(deps.tools.ffmpeg, audioArgs(filePath, audioPath), 120_000);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: /matches no streams/i.test(text) ? 'This video has no sound to listen to' : `ffmpeg could not read the sound: ${text}` };
    }

    let log: string;
    try {
      const output = await run(
        deps.cliPath,
        whisperArgs({
          modelPath: deps.modelPath,
          audioPath,
          outputBase: base,
          englishOnly: deps.englishOnly,
          threads: Math.max(1, Math.min(8, os.cpus().length - 1))
        }),
        LISTEN_TIMEOUT_MS
      );
      log = `${output.stderr}\n${output.stdout}`;
    } catch (error) {
      return { ok: false, reason: `whisper could not listen to it: ${error instanceof Error ? error.message : String(error)}` };
    }

    let segments: TranscriptSegment[] | null;
    try {
      segments = parseWhisperJson(JSON.parse(await fs.readFile(jsonPath, 'utf8')));
    } catch {
      segments = null;
    }
    if (segments === null) return { ok: false, reason: 'whisper finished without writing what it heard' };
    return { ok: true, segments, backend: backendFromLog(log), elapsedMs: now() - started };
  } finally {
    await Promise.all([fs.rm(audioPath, { force: true }), fs.rm(jsonPath, { force: true })]).catch(() => undefined);
  }
}
