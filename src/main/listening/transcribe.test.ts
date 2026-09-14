import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { audioArgs, transcribeFile, whisperArgs, type RunCapture } from './transcribe';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function workDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shortstack-listen-'));
  dirs.push(dir);
  return dir;
}

const TOOLS = { ffmpeg: 'ffmpeg.exe', ffprobe: 'ffprobe.exe' };
const HEARD = { transcription: [{ offsets: { from: 13960, to: 15240 }, text: " I'm going to bed, guys." }] };

/** Stands in for ffmpeg and whisper-cli: records what was asked, and writes what whisper would. */
function fakeTools(options: { log?: string; audioFails?: string; writeJson?: boolean } = {}): { run: RunCapture; calls: string[][] } {
  const calls: string[][] = [];
  const run: RunCapture = async (file, args) => {
    calls.push([file, ...args]);
    if (file === TOOLS.ffmpeg) {
      if (options.audioFails !== undefined) throw new Error(options.audioFails);
      await fs.writeFile(args[args.length - 1] as string, 'RIFF');
      return { stdout: '', stderr: '' };
    }
    const base = args[args.indexOf('-of') + 1] as string;
    if (options.writeJson !== false) await fs.writeFile(`${base}.json`, JSON.stringify(HEARD));
    return { stdout: '', stderr: options.log ?? 'load_backend: loaded CUDA backend from ggml-cuda.dll' };
  };
  return { run, calls };
}

describe('the commands', () => {
  it('pulls out mono 16 kHz sound from the first sound track', () => {
    expect(audioArgs('in.mov', 'out.wav').join(' ')).toBe('-hide_banner -nostdin -y -i in.mov -vn -map 0:a:0 -ac 1 -ar 16000 -c:a pcm_s16le out.wav');
  });

  it('asks for English with an English model, and works out the language otherwise, keeping the loading log', () => {
    const english = whisperArgs({ modelPath: 'm.bin', audioPath: 'a.wav', outputBase: 'o', englishOnly: true, threads: 4 });
    expect(english.join(' ')).toBe('-m m.bin -f a.wav -l en -t 4 -oj -of o');
    expect(whisperArgs({ modelPath: 'm.bin', audioPath: 'a.wav', outputBase: 'o', englishOnly: false, threads: 2 })).toContain('auto');
    expect(english).not.toContain('-np');
  });
});

describe('listening to a video', () => {
  it('returns what was said and where it ran, and leaves nothing behind', async () => {
    const dir = await workDir();
    const tools = fakeTools();
    const result = await transcribeFile({ tools: TOOLS, cliPath: 'whisper-cli.exe', modelPath: 'model.bin', englishOnly: true, workDir: dir, run: tools.run }, 'clip.mov');

    expect(result).toMatchObject({ ok: true, backend: 'gpu', segments: [{ from: 13960, to: 15240, text: "I'm going to bed, guys." }] });
    expect(tools.calls.map((call) => call[0])).toEqual(['ffmpeg.exe', 'whisper-cli.exe']);
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('says when it ran on the processor', async () => {
    const tools = fakeTools({ log: 'whisper_backend_init_gpu: no GPU found' });
    const result = await transcribeFile({ tools: TOOLS, cliPath: 'w', modelPath: 'm', englishOnly: true, workDir: await workDir(), run: tools.run }, 'clip.mov');
    expect(result).toMatchObject({ ok: true, backend: 'cpu' });
  });

  it('says a video has no sound, rather than that ffmpeg failed', async () => {
    const tools = fakeTools({ audioFails: 'Stream map 0:a:0 matches no streams.' });
    const result = await transcribeFile({ tools: TOOLS, cliPath: 'w', modelPath: 'm', englishOnly: true, workDir: await workDir(), run: tools.run }, 'silent.mov');
    expect(result).toEqual({ ok: false, reason: 'This video has no sound to listen to' });
    expect(tools.calls).toHaveLength(1);
  });

  it('fails plainly when whisper writes nothing', async () => {
    const dir = await workDir();
    const tools = fakeTools({ writeJson: false });
    const result = await transcribeFile({ tools: TOOLS, cliPath: 'w', modelPath: 'm', englishOnly: true, workDir: dir, run: tools.run }, 'clip.mov');
    expect(result).toEqual({ ok: false, reason: 'whisper finished without writing what it heard' });
    expect(await fs.readdir(dir)).toEqual([]);
  });
});
