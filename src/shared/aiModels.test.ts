import { describe, expect, it } from 'vitest';
import { isVisionModel } from './aiModels';

describe('isVisionModel', () => {
  it('recognises the families that can read an image', () => {
    for (const model of ['llava:13b', 'llama3.2-vision', 'bakllava', 'moondream', 'minicpm-v', 'llama4:scout', 'gemma3:12b']) {
      expect(isVisionModel(model), model).toBe(true);
    }
  });

  it('does not send images to a text-only model', () => {
    for (const model of ['llama3.2', 'mistral', 'phi3', 'qwen2.5:7b']) {
      expect(isVisionModel(model), model).toBe(false);
    }
  });
});
