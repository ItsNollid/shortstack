import { describe, expect, it } from 'vitest';
import { findModel, isVisionModel } from './aiModels';

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

describe('findModel', () => {
  const models = [
    { name: 'llama3.2:latest', vision: false, thinking: false },
    { name: 'llava:13b', vision: true, thinking: false }
  ];

  it('matches the exact name Ollama reported', () => {
    expect(findModel(models, 'llava:13b')?.vision).toBe(true);
  });

  // Typing "llama3.2" is a valid request to Ollama, so it has to find the installed llama3.2:latest.
  it('matches a name written without its tag', () => {
    expect(findModel(models, 'llama3.2')).toEqual({ name: 'llama3.2:latest', vision: false, thinking: false });
  });

  it('does not match a different model or an empty setting', () => {
    expect(findModel(models, 'mistral')).toBeUndefined();
    expect(findModel(models, '')).toBeUndefined();
  });
});
