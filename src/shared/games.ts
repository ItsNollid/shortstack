// Working out which game a Short is of, from what the person already wrote about it.
//
// This is the measure that changes what someone records next, which makes it the most actionable
// thing on the page: a posting time is a small lever, and the choice of game is a large one.
//
// Matching is deliberately conservative. Labelling a video with the wrong game would put a false
// comparison in front of someone making real decisions, so anything unrecognised stays unknown and
// is left out of the comparison rather than lumped into an "other" bucket that means nothing.

export interface GameMatcher {
  name: string;
  /** Lowercase needles. A word-boundary match on any one of them is enough. */
  aliases: readonly string[];
}

export const GAMES: readonly GameMatcher[] = [
  { name: 'Counter-Strike 2', aliases: ['cs2', 'counter strike', 'counterstrike', 'csgo', 'cs go'] },
  { name: 'Minecraft', aliases: ['minecraft', 'mc survival', 'hardcore minecraft'] },
  { name: 'Grand Theft Auto', aliases: ['gta', 'grand theft auto', 'gta5', 'gta v', 'gtav', 'gta6', 'gta vi', 'gtavi'] },
  {
    name: 'Call of Duty: Black Ops 3 Zombies',
    aliases: ['black ops 3 zombies', 'blackops3zombies', 'bo3 zombies', 'bo3zombies', 'bo3']
  },
  { name: 'Call of Duty', aliases: ['call of duty', 'callofduty', 'warzone', 'modern warfare', 'cod'] },
  { name: 'Fortnite', aliases: ['fortnite'] },
  { name: 'Rust', aliases: ['rust wipe', 'rustgame', 'playrust'] },
  { name: 'Lethal Company', aliases: ['lethal company', 'lethalcompany'] },
  { name: 'Phasmophobia', aliases: ['phasmophobia', 'phasmo'] },
  { name: 'Among Us', aliases: ['among us', 'amongus'] },
  { name: 'Roblox', aliases: ['roblox'] },
  { name: 'Valorant', aliases: ['valorant'] },
  { name: 'Apex Legends', aliases: ['apex legends', 'apexlegends'] },
  { name: 'Rocket League', aliases: ['rocket league', 'rocketleague'] },
  { name: 'Garry’s Mod', aliases: ["garry's mod", 'garrys mod', 'gmod'] },
  { name: 'Sea of Thieves', aliases: ['sea of thieves', 'seaofthieves'] },
  { name: 'Halo', aliases: ['halo infinite', 'halo mcc'] },
  { name: 'Elden Ring', aliases: ['elden ring', 'eldenring'] },
  { name: 'Schedule I', aliases: ['schedule 1', 'schedule i'] },
  { name: 'Repo', aliases: ['r.e.p.o', 'repo game'] }
];

/**
 * Hashtags run words together, so "#gta5" has to match "gta" without "gtavi" matching "gta" in a way
 * that hides the more specific answer. Longer aliases are therefore tried first, and a match must
 * sit on a boundary rather than inside a longer word — otherwise "cod" matches "code" and every
 * video about a code review becomes a Call of Duty video.
 */
const matchesAlias = (haystack: string, alias: string): boolean => {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(alias, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : haystack[at - 1] as string;
    const after = haystack[at + alias.length] ?? '';
    const isWordCharacter = (character: string): boolean => /[\p{L}\p{N}]/u.test(character);
    if (!isWordCharacter(before) && !isWordCharacter(after)) return true;
    from = at + 1;
  }
};

export interface GameSubject {
  title: string;
  description?: string;
  tags?: readonly string[];
}

/** The game this video is of, or null when nothing matches confidently. */
export function detectGame(subject: GameSubject, games: readonly GameMatcher[] = GAMES): string | null {
  const haystack = [subject.title, subject.description ?? '', ...(subject.tags ?? [])].join(' · ').toLowerCase();

  // Most specific first: a Black Ops 3 zombies clip is that, not merely Call of Duty.
  const ranked = [...games]
    .flatMap((game) => game.aliases.map((alias) => ({ game: game.name, alias })))
    .sort((left, right) => right.alias.length - left.alias.length);

  for (const { game, alias } of ranked) {
    if (matchesAlias(haystack, alias)) return game;
  }
  return null;
}
