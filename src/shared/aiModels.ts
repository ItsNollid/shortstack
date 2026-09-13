// Which local models can read an image. Shared so Settings can say what a chosen model will and
// will not be able to do, using exactly the rule the request itself uses.

export interface AiModel {
  name: string;
  /** Whether it can read an image: what Ollama reports, or a guess from the name if it reports nothing. */
  vision: boolean;
}

/**
 * Ollama lists a model's capabilities, which is the authoritative answer and includes "vision".
 * Older daemons do not send the field at all, so the name is the fallback rather than the rule.
 */
export function visionFrom(capabilities: unknown, name: string): boolean {
  return Array.isArray(capabilities) ? capabilities.includes('vision') : isVisionModel(name);
}
const VISION_FAMILIES = [
  'llava',
  'vision',
  'bakllava',
  'moondream',
  'minicpm-v',
  'llama4',
  'llama-4',
  'gemma3',
  'qwen2.5vl',
  'qwen2-vl'
];

export function isVisionModel(model: string): boolean {
  const name = model.toLowerCase();
  return VISION_FAMILIES.some((family) => name.includes(family));
}

/**
 * Ollama lists models as name:tag ("llama3.2:latest") but accepts the bare name in a request, so a
 * setting of "llama3.2" is valid and still has to be matched against the list, or the app would
 * decide it knows nothing about a model that is sitting right there.
 */
export function findModel(models: readonly AiModel[], name: string): AiModel | undefined {
  if (name === '') return undefined;
  const base = (value: string): string => value.split(':')[0] as string;
  return models.find((model) => model.name === name) ?? models.find((model) => base(model.name) === base(name));
}
