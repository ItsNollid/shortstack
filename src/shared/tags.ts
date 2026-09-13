// Tags for a Short, assembled from what is certain rather than taken whole from the model.
//
// Descriptions went the same way first. Left to the model, tags came back repetitive — "gaming",
// "funny moments", the same four phrases on every video — and now and then named another game or a
// gamertag read off the screen. So the parts that are known lead: the game as people type it, what
// happens in this clip, and the two together as the longer phrases people actually search. The model's
// own tags follow, once anything generic, unrelated or naming someone is taken out.
import { hashtagNames, mentionedIn } from './blockedNames';
import { GAMES } from './games';
import { gameHashtags, relevantToGame, toHashtag } from './hashtags';
import { TAGS_MAX_CHARS, tagsCharCount } from './settings';

/** Longer than this and a tag is a sentence, which nobody types into search. */
const MAX_TAG_CHARS = 30;
/** How many "game + topic" phrases: enough to catch the long searches, few enough not to crowd the rest. */
const MAX_COMBINED = 3;
/** A game name this short can stand in a phrase as it is; a longer one is shortened to its nearest spelling. */
const SHORT_NAME_CHARS = 16;

/** Tags that describe every gaming video there is, which is to say none of them. */
const GENERIC: ReadonlySet<string> = new Set([
  'gaming',
  'game',
  'games',
  'gamer',
  'videogame',
  'videogames',
  'gameplay',
  'funny',
  'funnymoments',
  'funnyvideo',
  'epic',
  'viral',
  'trending',
  'fyp',
  'foryou',
  'shorts',
  'short',
  'youtubeshorts',
  'ytshorts',
  'clip',
  'clips',
  'video',
  'videos',
  'moment',
  'moments'
]);

const squash = (value: string): string => value.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
const phrase = (value: string): string =>
  value
    .replace(/[<>]/g, '')
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export interface TagInput {
  game: string | null;
  /** What happens in the clip, as short phrases. */
  topics: readonly string[];
  /** What the model offered as tags, kept only where it adds something. */
  modelTags: readonly string[];
  /** Names never to use: friends' gamertags and the channel's own. */
  names: readonly string[];
}

/**
 * The game as people type it: its name, then the spellings its hashtags use, spaced wherever the spaced
 * form is known. Its hashtags are deliberately limited to ways of spelling the game. The detector's
 * aliases are not a safe source — they include modes and versions, and measured, they tagged a Minecraft
 * clip "mc survival" and would tag a GTA V one "gta vi".
 */
function gamePhrases(game: string | null): { all: string[]; short: string | null } {
  const name = game?.trim() ?? '';
  if (name === '') return { all: [], short: null };

  const spaced = new Map<string, string>();
  for (const entry of GAMES) {
    for (const alias of entry.aliases) {
      if (alias.includes(' ')) spaced.set(squash(alias), phrase(alias));
    }
  }
  const spellings = gameHashtags(name)
    .map((tag) => tag.slice(1))
    // "#minecraftshorts" is a hashtag habit, not something anyone types as a tag.
    .filter((body) => !body.endsWith('shorts'))
    .map((body) => spaced.get(body) ?? body);

  const full = phrase(name);
  const all = [full, ...spellings];
  const shortest = all
    .filter((each) => each.includes(' ') && each.length <= MAX_TAG_CHARS)
    .sort((a, b) => a.length - b.length)[0];
  const short = full.length <= SHORT_NAME_CHARS ? full : (shortest ?? spellings[0] ?? full);
  return { all, short };
}

export function buildTags(input: TagInput): string[] {
  const game = gamePhrases(input.game);
  const topics = input.topics.map(phrase).filter((topic) => topic !== '');
  const combined = game.short === null ? [] : topics.slice(0, MAX_COMBINED).map((topic) => `${game.short} ${topic}`);

  const candidates = [...game.all, ...topics, ...combined, ...input.modelTags.map(phrase)];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of candidates) {
    const key = squash(tag);
    if (key === '' || seen.has(key) || tag.length > MAX_TAG_CHARS || GENERIC.has(key)) continue;
    if (mentionedIn(tag, input.names) || hashtagNames(tag, input.names)) continue;
    // A tag naming another game is an unrelated tag, the same as a hashtag would be.
    const asHashtag = toHashtag(tag);
    if (asHashtag !== null && !relevantToGame(asHashtag, input.game)) continue;
    seen.add(key);
    tags.push(tag);
  }

  // YouTube counts commas and quote marks towards its budget, so the last tags give way until it fits.
  while (tags.length > 0 && tagsCharCount(tags) > TAGS_MAX_CHARS) tags.pop();
  return tags;
}
