import { describe, expect, it } from 'vitest';
import { backendFromLog, parseTimestamp, parseWhisperJson, transcriptText } from './transcript';

/** The shape whisper-cli wrote for "ALRIGHT GUYS IM GOING TO BED.mov", trimmed to three segments. */
const HEARD = {
  systeminfo: 'AVX = 1',
  model: { type: 'medium' },
  transcription: [
    { timestamps: { from: '00:00:00,000', to: '00:00:03,120' }, offsets: { from: 0, to: 3120 }, text: ' How come when I close my eyes, all I can see is the star of David?' },
    { timestamps: { from: '00:00:04,360', to: '00:00:05,720' }, offsets: { from: 4360, to: 5720 }, text: ' Alright, restart your game, Brett.' },
    { timestamps: { from: '00:00:13,960', to: '00:00:15,240' }, offsets: { from: 13960, to: 15240 }, text: " I'm going to bed, guys." }
  ]
};

describe('reading what whisper heard', () => {
  it('keeps each line with when it was said', () => {
    expect(parseWhisperJson(HEARD)).toEqual([
      { from: 0, to: 3120, text: 'How come when I close my eyes, all I can see is the star of David?' },
      { from: 4360, to: 5720, text: 'Alright, restart your game, Brett.' },
      { from: 13960, to: 15240, text: "I'm going to bed, guys." }
    ]);
  });

  it('falls back to the written timestamps, and drops what is not speech', () => {
    const parsed = parseWhisperJson({
      transcription: [
        { timestamps: { from: '00:01:02,500', to: '00:01:03,000' }, text: ' Did you hear a gunshot?' },
        { offsets: { from: 0, to: 900 }, text: ' [MUSIC]' },
        { offsets: { from: 900, to: 1000 }, text: '   ' },
        { text: 'no times at all' }
      ]
    });
    expect(parsed).toEqual([{ from: 62_500, to: 63_000, text: 'Did you hear a gunshot?' }]);
  });

  it('is nothing when it is not whisper output', () => {
    expect(parseWhisperJson({ result: [] })).toBeNull();
    expect(parseWhisperJson('text')).toBeNull();
    expect(parseTimestamp('4.36')).toBeNull();
  });
});

describe('what goes into a prompt', () => {
  it('is everything said, in order', () => {
    expect(transcriptText(parseWhisperJson(HEARD) ?? [])).toBe(
      "How come when I close my eyes, all I can see is the star of David? Alright, restart your game, Brett. I'm going to bed, guys."
    );
  });

  it('is cut at a word when there is too much', () => {
    const text = transcriptText(parseWhisperJson(HEARD) ?? [], 40);
    expect(text).toBe('How come when I close my eyes, all I can…');
  });
});

describe('where it ran', () => {
  it('reads the graphics card or the processor from the log', () => {
    expect(backendFromLog('load_backend: loaded CUDA backend from ggml-cuda.dll')).toBe('gpu');
    // What the CUDA 11.8 build printed on this PC, missing cublas64_11.dll.
    expect(backendFromLog('load_backend: loaded CPU backend from ggml-cpu-haswell.dll\nwhisper_backend_init_gpu: no GPU found')).toBe('cpu');
    expect(backendFromLog('')).toBe('unknown');
  });
});
