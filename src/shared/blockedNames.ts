// Names that must never end up in a video's details: friends' gamertags, and the channel's own name.
//
// Measured: shown a lobby with a player list, the model offered the channel's own name and a friend's
// gamertag as topics and as tags, though its prompt told it not to. A prompt is a request; this is the
// rule. Every name here is taken out of what the model wrote after it answers.

const MAX_NAMES = 100;
const MAX_NAME_CHARS = 40;
/**
 * Inside a hashtag, words run together, so a name can only be found as part of the body. Below this
 * many letters that finds names everywhere — "ace" in #spacestation — so a short name must match whole.
 */
const MIN_CONTAINED = 4;

const squash = (value: string): string => value.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function checkBlockedNames(names: string[]): string | null {
  if (names.length > MAX_NAMES) return `Keep the list to ${MAX_NAMES} names`;
  const seen = new Set<string>();
  for (const name of names) {
    if (/[<>]/.test(name)) return 'Names cannot contain < or >';
    if ([...name].length > MAX_NAME_CHARS) return `“${name.slice(0, MAX_NAME_CHARS)}” is too long to be a name`;
    const key = squash(name);
    if (key === '') return 'A name needs at least one letter or number';
    if (seen.has(key)) return `“${name}” is in the list twice`;
    seen.add(key);
  }
  return null;
}

/**
 * Whether a title, tag or topic names any of them, as a word of its own: "DrPhuckass", "dr_phuckass"
 * and "Dr Phuckass" all count for "Dr Phuckass", but "Cat" is not found in "catch".
 */
export function mentionedIn(text: string, names: readonly string[]): boolean {
  return names.some((name) => {
    const parts = name.split(/[^\p{L}\p{N}]+/u).filter((part) => part !== '');
    if (parts.length === 0) return false;
    const body = parts.map(escapeRegExp).join('[^\\p{L}\\p{N}]*');
    return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu').test(text);
  });
}

/** Whether a hashtag contains any of them, run together with other words: #nollidclips names Nollid. */
export function hashtagNames(tag: string, names: readonly string[]): boolean {
  const body = squash(tag);
  if (body === '') return false;
  return names.some((name) => {
    const key = squash(name);
    return key !== '' && (key.length < MIN_CONTAINED ? body === key : body.includes(key));
  });
}
