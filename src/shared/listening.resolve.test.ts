import { describe, expect, it } from 'vitest';
import { resolveListening, type ListeningChoice } from './listening';

const choice = (over: Partial<ListeningChoice> = {}): ListeningChoice => ({
  engine: 'auto',
  installedEngines: ['cpu', 'gpu'],
  modelId: 'small.en-q5_1',
  modelFile: '',
  installedModels: ['small.en-q5_1'],
  ...over
});

describe('what would listen right now', () => {
  it('uses the graphics card build when both are installed and nothing is chosen', () => {
    expect(resolveListening(choice())).toEqual({
      ok: true,
      value: { engine: 'gpu', modelId: 'small.en-q5_1', modelFile: null, englishOnly: true, label: 'Small' }
    });
    expect(resolveListening(choice({ installedEngines: ['cpu'] }))).toMatchObject({ ok: true, value: { engine: 'cpu' } });
  });

  it('uses the chosen engine, and says when it is not downloaded', () => {
    expect(resolveListening(choice({ engine: 'cpu' }))).toMatchObject({ ok: true, value: { engine: 'cpu' } });
    expect(resolveListening(choice({ engine: 'gpu', installedEngines: ['cpu'] }))).toEqual({
      ok: false,
      reason: 'The nvidia graphics card engine is not downloaded'
    });
    expect(resolveListening(choice({ installedEngines: [] }))).toEqual({ ok: false, reason: 'Download a listening engine first' });
  });

  it('prefers a model file from this computer, and tells an English-only one from its name', () => {
    expect(resolveListening(choice({ modelFile: 'C:\\Users\\me\\AppData\\Local\\vibe\\ggml-medium.bin' }))).toEqual({
      ok: true,
      value: { engine: 'gpu', modelId: null, modelFile: 'C:\\Users\\me\\AppData\\Local\\vibe\\ggml-medium.bin', englishOnly: false, label: 'ggml-medium.bin' }
    });
    expect(resolveListening(choice({ modelFile: '/models/ggml-small.en-q5_1.bin' }))).toMatchObject({ ok: true, value: { englishOnly: true } });
  });

  it('says a model has to be chosen or downloaded', () => {
    expect(resolveListening(choice({ modelId: '' }))).toEqual({ ok: false, reason: 'Choose a listening model' });
    expect(resolveListening(choice({ modelId: 'medium.en-q5_0' }))).toEqual({ ok: false, reason: 'Download the Medium model first' });
  });
});
