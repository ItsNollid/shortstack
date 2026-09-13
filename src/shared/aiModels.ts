// Which local models can read an image. Shared so Settings can say what a chosen model will and
// will not be able to do, using exactly the rule the request itself uses.
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
