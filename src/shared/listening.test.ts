import { describe, expect, it } from 'vitest';
import { ENGINES, MODELS, downloadSize, findModel, modelUrl, recommendListening } from './listening';

describe('what can be downloaded', () => {
  it('names every file with a checksum that can actually be checked', () => {
    for (const item of [...Object.values(ENGINES), ...MODELS]) {
      expect(item.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(item.bytes).toBeGreaterThan(0);
    }
  });

  it('comes only from the official sources, over https', () => {
    for (const engine of Object.values(ENGINES)) expect(engine.url.startsWith('https://github.com/ggml-org/whisper.cpp/releases/download/')).toBe(true);
    for (const model of MODELS) {
      expect(modelUrl(model).startsWith('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-')).toBe(true);
      expect(model.file.endsWith('.bin')).toBe(true);
    }
  });

  it('lists each model once, smallest first', () => {
    expect(new Set(MODELS.map((model) => model.id)).size).toBe(MODELS.length);
    expect(MODELS.map((model) => model.bytes)).toEqual([...MODELS.map((model) => model.bytes)].sort((a, b) => a - b));
  });
});

describe('what is offered first', () => {
  it('uses the graphics card and a larger model where there is an NVIDIA card', () => {
    expect(recommendListening({ hasNvidia: true, memoryBytes: 32 * 1024 ** 3 })).toEqual({ engine: 'gpu', model: findModel('medium.en-q5_0') });
  });

  it('keeps to the processor and a smaller model otherwise, smaller still with little memory', () => {
    expect(recommendListening({ hasNvidia: false, memoryBytes: 16 * 1024 ** 3 }).model.id).toBe('small.en-q5_1');
    expect(recommendListening({ hasNvidia: false, memoryBytes: 4 * 1024 ** 3 })).toMatchObject({ engine: 'cpu', model: { id: 'base.en-q5_1' } });
  });
});

describe('download sizes', () => {
  it('reads the way a person would say them', () => {
    expect(downloadSize(8_573_270)).toBe('8.6 MB');
    expect(downloadSize(539_225_533)).toBe('539 MB');
    expect(downloadSize(1_533_763_059)).toBe('1.5 GB');
  });
});
