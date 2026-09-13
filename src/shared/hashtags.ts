// Building a Short's description, which on this channel is a block of hashtags and nothing else.
//
// Nobody reads it; it exists for search. That makes it the wrong job for a language model: asked to
// write one, qwen3-vl:8b copied the channel's old hashtags wholesale, invented round numbers that
// never happened, or fell back on "#gaming #shorts". So the model no longer writes it. It supplies
// only what it alone can — a few words about what happens in this clip — and the block is assembled
// here from parts that are reliable.
//
// Two rules from YouTube's own hashtag policy shape everything below:
//   - "If a video has more than 60 hashtags, we'll ignore each hashtag on that content."
//   - "Misleading or unrelated hashtags may result in the removal of your video."
// The second is the one that bites a channel playing several games: a #blackops3zombies learned from
// the channel's history, stamped onto a Counter-Strike clip, is exactly an unrelated hashtag.
import { detectGame } from './games';

/** Past this YouTube ignores every hashtag on the video, not just the extras. */
export const HASHTAG_HARD_LIMIT = 60;
/** A focused block. Far enough under the cliff that a footer added later cannot push it over. */
export const DEFAULT_HASHTAG_COUNT = 20;
const MAX_TOPIC_HASHTAGS = 6;
/** Longer than this and it is a sentence with the spaces removed, which nobody searches for. */
const MAX_HASHTAG_LENGTH = 40;
/**
 * A topic is a search term. Measured: asked for two to four words, the model wrote "zombie fireplace
 * scene", which becomes #zombiefireplacescene — a tag nobody has ever typed.
 */
const MAX_TOPIC_LENGTH = 20;
/** "#cs2shorts" is searched; "#blackops3zombiesshorts" is a mouthful. */
const MAX_SHORTS_FORM_BASE = 12;

/**
 * Words that pad a phrase without adding anything anyone searches for. The model wrote "campfire
 * moment" and "feeling good question"; with these taken out they become #campfire and #feelinggood.
 */
const FILLER = new Set([
  'moment',
  'moments',
  'scene',
  'scenes',
  'clip',
  'clips',
  'video',
  'videos',
  'question',
  'part',
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'with',
  'and'
]);

/**
 * Hashtags for each game, limited to ways of spelling the game itself. Modes and versions are left
 * out on purpose: #warzone on a campaign clip, or #gta6 on a GTA V one, is an unrelated hashtag.
 */
const GAME_HASHTAGS: Record<string, readonly string[]> = {
  'Counter-Strike 2': ['#cs2', '#counterstrike2', '#counterstrike'],
  Minecraft: ['#minecraft'],
  'Grand Theft Auto': ['#gta', '#grandtheftauto'],
  'Call of Duty: Black Ops 3 Zombies': ['#blackops3zombies', '#bo3zombies', '#codzombies', '#blackops3', '#callofduty'],
  'Call of Duty': ['#callofduty', '#cod'],
  Fortnite: ['#fortnite'],
  Rust: ['#rust', '#rustgame'],
  'Lethal Company': ['#lethalcompany'],
  Phasmophobia: ['#phasmophobia', '#phasmo'],
  'Among Us': ['#amongus'],
  Roblox: ['#roblox'],
  Valorant: ['#valorant'],
  'Apex Legends': ['#apexlegends', '#apex'],
  'Rocket League': ['#rocketleague'],
  'Garry’s Mod': ['#garrysmod', '#gmod'],
  'Sea of Thieves': ['#seaofthieves'],
  Halo: ['#halo'],
  'Elden Ring': ['#eldenring'],
  'Schedule I': ['#schedule1', '#scheduleone'],
  Repo: ['#repo', '#repogame']
};

/**
 * A phrase as a hashtag: lower case, accents folded, every space and symbol removed. Null for
 * anything that would not survive as one — empty, all digits, or too long to be a search term.
 */
export function toHashtag(phrase: string): string | null {
  const body = phrase
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  if (body === '' || body.length > MAX_HASHTAG_LENGTH || /^\p{N}+$/u.test(body)) return null;
  return `#${body}`;
}

/** A topic from the model as a hashtag, with the filler taken out. Null if nothing searchable is left. */
export function topicHashtag(phrase: string): string | null {
  const words = phrase
    .replace(/^#+/, '')
    .split(/\s+/)
    .filter((word) => word !== '' && !FILLER.has(word.toLowerCase()));
  if (words.length === 0) return null;
  const tag = toHashtag(words.join(' '));
  return tag !== null && tag.length - 1 <= MAX_TOPIC_LENGTH ? tag : null;
}

/** The game's own hashtags, plus the "#minecraftshorts" form where the name is short enough for it. */
export function gameHashtags(game: string | null | undefined): string[] {
  const name = game?.trim() ?? '';
  if (name === '') return [];

  const known = Object.entries(GAME_HASHTAGS).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  const own = known ?? [toHashtag(name)].filter((tag): tag is string => tag !== null);
  const base = own[0]?.slice(1) ?? '';
  const shortsForm = base !== '' && base.length <= MAX_SHORTS_FORM_BASE ? toHashtag(`${base}shorts`) : null;
  return dedupe([...own, ...(shortsForm === null ? [] : [shortsForm])]);
}

function dedupe(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(tag);
  }
  return kept;
}

const bodyOf = (tag: string): string => tag.replace(/^#+/, '').toLowerCase();

/** Every game whose own hashtag a tag begins with: "#codzombies", "#gtaonline", "#cs2clips". */
function gamesByPrefix(body: string): string[] {
  return Object.entries(GAME_HASHTAGS)
    .filter(([, tags]) => tags.some((each) => body.startsWith(bodyOf(each))))
    .map(([name]) => name);
}

/**
 * Whether a hashtag is safe on this video. One that names a game is kept only when it names this
 * video's game; when nobody has said which game this is, every game-naming hashtag is dropped,
 * because a wrong guess here can get the video taken down.
 *
 * Hashtags run words together, which is exactly what the game detector's word-boundary rule is built
 * to ignore — "cod" must not match "code" in a title — so on its own it let #codzombies onto a
 * Counter-Strike clip. A tag therefore also counts as naming a game if it starts with that game's
 * own hashtag.
 *
 * That check is deliberately greedy. It will now and then drop a harmless tag that merely begins like
 * a game — #reposted, #codingfun — which costs a sliver of search. Keeping an unrelated game tag can
 * cost the video, so every doubt falls on the side of dropping.
 */
export function relevantToGame(tag: string, game: string | null | undefined): boolean {
  const body = bodyOf(tag);
  const own = game?.trim() ?? '';

  if (own !== '') {
    const ownKey = Object.keys(GAME_HASHTAGS).find((name) => name.toLowerCase() === own.toLowerCase());
    const ownTags =
      ownKey !== undefined ? (GAME_HASHTAGS[ownKey] ?? []) : [toHashtag(own)].filter((each): each is string => each !== null);
    if (ownTags.some((each) => body.startsWith(bodyOf(each)))) return true;
    if (detectGame({ title: body })?.toLowerCase() === own.toLowerCase()) return true;
  }

  const namesAGame = detectGame({ title: body }) !== null || gamesByPrefix(body).length > 0;
  return !namesAGame;
}

export interface HashtagBlockInput {
  game: string | null | undefined;
  /** What the model saw happen in the clip, as short phrases. */
  topics: readonly string[];
  /** Hashtags this channel uses on most of its uploads. */
  standing: readonly string[];
  /**
   * Names that must never become a topic hashtag — the channel's own, for one. Measured: the model
   * read "Nollid" and a friend's gamertag off a lobby screen and offered both as topics. Only names
   * known in advance can be removed here; the rest rests on the prompt telling it not to.
   */
  exclude?: readonly string[];
  limit?: number;
}

/**
 * The description. Ordered so that if the cap cuts anything it cuts the least important part: the
 * game and #shorts first, because they are certainly true and most searched, then what happens in
 * this clip, then the channel's habits. The model's topics go through the same relevance check as
 * the channel's habits — a topic can name the wrong game as easily as an old hashtag can.
 */
export function buildHashtagBlock(input: HashtagBlockInput): string[] {
  const limit = Math.max(1, Math.min(HASHTAG_HARD_LIMIT, input.limit ?? DEFAULT_HASHTAG_COUNT));
  const excluded = new Set((input.exclude ?? []).map((name) => toHashtag(name)).filter((tag): tag is string => tag !== null));

  const topics = input.topics
    .map(topicHashtag)
    .filter((tag): tag is string => tag !== null && !excluded.has(tag) && relevantToGame(tag, input.game))
    .slice(0, MAX_TOPIC_HASHTAGS);

  const standing = input.standing
    .map((tag) => toHashtag(tag))
    .filter((tag): tag is string => tag !== null && relevantToGame(tag, input.game));

  return dedupe([...gameHashtags(input.game), '#shorts', ...topics, ...standing]).slice(0, limit);
}

export const hashtagDescription = (tags: readonly string[]): string => tags.join(' ');

/** Every hashtag known to name a game. The spelling checker counts them as words, not typos. */
export function allGameHashtags(): string[] {
  return dedupe(Object.values(GAME_HASHTAGS).flat());
}

/**
 * The game a hashtag someone typed names, if any: #fortnite is Fortnite, #codzombies is Call of Duty.
 * For warning about a hashtag, so narrower than `relevantToGame`, which decides what the app adds
 * itself and drops at any doubt. Here a hashtag only counts by its start when the game's own hashtag
 * is long enough to mean something, so #reposted is not taken for #repo, nor #code for #cod. Where two
 * games share a hashtag, the one it leads for wins: #callofduty is Call of Duty, not Black Ops 3.
 */
export function gameNamedByHashtag(tag: string): string | null {
  const body = bodyOf(tag);
  if (body === '') return null;

  let best: { name: string; rank: number } | null = null;
  for (const [name, tags] of Object.entries(GAME_HASHTAGS)) {
    for (let index = 0; index < tags.length; index += 1) {
      const own = bodyOf(tags[index] as string);
      const rank = body === own ? index : own.length >= 5 && body.startsWith(own) ? 100 + index : null;
      if (rank !== null && (best === null || rank < best.rank)) best = { name, rank };
    }
  }
  return best?.name ?? detectGame({ title: body });
}

/** The same game, or one is part of the other: Call of Duty and Call of Duty: Black Ops 3 Zombies. */
export function sameGameFamily(a: string, b: string): boolean {
  const first = a.trim().toLowerCase();
  const second = b.trim().toLowerCase();
  return first === second || first.startsWith(second) || second.startsWith(first);
}
