import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HASHTAG_COUNT,
  HASHTAG_HARD_LIMIT,
  buildHashtagBlock,
  gameHashtags,
  hashtagDescription,
  relevantToGame,
  toHashtag,
  topicHashtag
} from './hashtags';

describe('toHashtag', () => {
  it('joins the words and lower-cases them', () => {
    expect(toHashtag('Last Second Clutch')).toBe('#lastsecondclutch');
    expect(toHashtag('  knife   round ')).toBe('#kniferound');
  });

  // YouTube: "Hashtags don't contain any spaces."
  it('removes spaces, punctuation and a hash that was already there', () => {
    expect(toHashtag('#one-tap, no scope!')).toBe('#onetapnoscope');
    expect(toHashtag("Garry's Mod")).toBe('#garrysmod');
  });

  it('folds accents rather than dropping the letter', () => {
    expect(toHashtag('Pokémon')).toBe('#pokemon');
  });

  it('refuses what would not work as a hashtag', () => {
    expect(toHashtag('')).toBeNull();
    expect(toHashtag('!!!')).toBeNull();
    expect(toHashtag('100')).toBeNull();
    expect(toHashtag('this is really a whole sentence pretending to be a hashtag')).toBeNull();
  });

  it('keeps numbers that are part of a word', () => {
    expect(toHashtag('round 100')).toBe('#round100');
    expect(toHashtag('CS2')).toBe('#cs2');
  });
});

describe('topicHashtag', () => {
  // Measured: the model wrote these, and without this they became #campfiremoment and
  // #zombiefireplacescene — tags nobody has ever searched for.
  it('takes the filler out of what the model wrote', () => {
    expect(topicHashtag('campfire moment')).toBe('#campfire');
    expect(topicHashtag('zombie fireplace scene')).toBe('#zombiefireplace');
    expect(topicHashtag('feeling good question')).toBe('#feelinggood');
  });

  it('gives nothing when filler is all there was', () => {
    expect(topicHashtag('clip')).toBeNull();
    expect(topicHashtag('the moment')).toBeNull();
  });

  it('refuses a compound too long to be a search term', () => {
    expect(topicHashtag('craziest comeback anyone has ever seen')).toBeNull();
  });

  it('copes with a hash the model added itself', () => {
    expect(topicHashtag('#Knife Round')).toBe('#kniferound');
  });
});

describe('gameHashtags', () => {
  it('uses the spellings of the game, and the shorts form', () => {
    expect(gameHashtags('Counter-Strike 2')).toEqual(['#cs2', '#counterstrike2', '#counterstrike', '#cs2shorts']);
    expect(gameHashtags('Minecraft')).toEqual(['#minecraft', '#minecraftshorts']);
  });

  // Measured: the long form came out as #blackops3zombiesshorts.
  it('skips the shorts form when the name is too long for it to be searched', () => {
    const bo3 = gameHashtags('Call of Duty: Black Ops 3 Zombies');
    expect(bo3).toContain('#blackops3zombies');
    expect(bo3).not.toContain('#blackops3zombiesshorts');
  });

  // #gta6 on a GTA V clip, or #warzone on a campaign clip, is an unrelated hashtag.
  it('leaves out versions and modes that might not be true of this clip', () => {
    const gta = gameHashtags('Grand Theft Auto');
    for (const risky of ['#gta5', '#gta6', '#gtaonline']) expect(gta).not.toContain(risky);
    expect(gameHashtags('Call of Duty')).not.toContain('#warzone');
  });

  it('builds something sensible for a game it has never heard of', () => {
    expect(gameHashtags('Peak')).toEqual(['#peak', '#peakshorts']);
  });

  it('matches the name without caring about case', () => {
    expect(gameHashtags('minecraft')[0]).toBe('#minecraft');
  });

  it('gives nothing when nobody has said which game', () => {
    expect(gameHashtags(null)).toEqual([]);
    expect(gameHashtags('   ')).toEqual([]);
  });
});

describe('relevantToGame', () => {
  it('keeps a hashtag that names no game at all', () => {
    expect(relevantToGame('#funny', 'Counter-Strike 2')).toBe(true);
    expect(relevantToGame('#clutch', null)).toBe(true);
  });

  it('keeps one that names this video’s game', () => {
    expect(relevantToGame('#blackops3zombies', 'Call of Duty: Black Ops 3 Zombies')).toBe(true);
  });

  // YouTube: "Misleading or unrelated hashtags may result in the removal of your video."
  it('drops one that names a different game', () => {
    expect(relevantToGame('#blackops3zombies', 'Counter-Strike 2')).toBe(false);
    expect(relevantToGame('#minecraft', 'Grand Theft Auto')).toBe(false);
  });

  it('drops every game-naming one when nobody has said which game this is', () => {
    expect(relevantToGame('#blackops3zombies', null)).toBe(false);
  });

  // Hashtags run words together, which the title detector's word-boundary rule deliberately ignores.
  // On its own it let #codzombies onto a Counter-Strike clip.
  it('catches a game name run together with other words', () => {
    expect(relevantToGame('#codzombies', 'Counter-Strike 2')).toBe(false);
    expect(relevantToGame('#gtaonline', 'Minecraft')).toBe(false);
    expect(relevantToGame('#cs2clips', 'Minecraft')).toBe(false);
    expect(relevantToGame('#minecraftbuilds', 'Minecraft')).toBe(true);
    expect(relevantToGame('#peakshorts', 'Peak')).toBe(true);
  });
});

describe('buildHashtagBlock', () => {
  const standing = ['#blackops3zombies', '#codzombies', '#funny', '#gaming', '#shorts'];

  it('puts the game and #shorts first, then the clip, then the channel habits', () => {
    const block = buildHashtagBlock({ game: 'Minecraft', topics: ['creeper ambush', 'base destroyed'], standing: ['#funny'] });
    expect(block).toEqual(['#minecraft', '#minecraftshorts', '#shorts', '#creeperambush', '#basedestroyed', '#funny']);
  });

  // The failure this whole module exists for: a multi-game channel's old tags on the wrong game.
  it('never carries another game’s hashtags onto this one', () => {
    const block = buildHashtagBlock({ game: 'Counter-Strike 2', topics: ['ace'], standing });
    expect(block).not.toContain('#blackops3zombies');
    expect(block).not.toContain('#codzombies');
    expect(block).toContain('#funny');
    expect(block).toContain('#cs2');
  });

  it('holds the model’s topics to the same rule as the channel’s habits', () => {
    const block = buildHashtagBlock({ game: 'Minecraft', topics: ['gta heist', 'creeper'], standing: [] });
    expect(block).not.toContain('#gtaheist');
    expect(block).toContain('#creeper');
  });

  it('keeps the channel’s own game tags when this video is that game', () => {
    const block = buildHashtagBlock({ game: 'Call of Duty: Black Ops 3 Zombies', topics: [], standing });
    expect(block).toContain('#blackops3zombies');
    expect(block).toContain('#codzombies');
  });

  it('does not repeat a hashtag that arrives from two places', () => {
    const block = buildHashtagBlock({ game: 'Minecraft', topics: ['minecraft'], standing: ['#Minecraft', '#shorts'] });
    expect(block.filter((tag) => tag === '#minecraft')).toHaveLength(1);
    expect(block.filter((tag) => tag === '#shorts')).toHaveLength(1);
  });

  it('uses only a handful of topics, however many the model offers', () => {
    const topics = Array.from({ length: 15 }, (_, index) => `combo xy${String.fromCharCode(97 + index)}`);
    const block = buildHashtagBlock({ game: null, topics, standing: [] });
    expect(block.filter((tag) => tag.startsWith('#comboxy'))).toHaveLength(6);
  });

  it('stays at the default size unless asked otherwise', () => {
    const topics = Array.from({ length: 6 }, (_, index) => `topic ${String.fromCharCode(98 + index)}x`);
    const many = Array.from({ length: 40 }, (_, index) => `#habit${String.fromCharCode(97 + (index % 26))}${index}`);
    expect(buildHashtagBlock({ game: 'Minecraft', topics, standing: many })).toHaveLength(DEFAULT_HASHTAG_COUNT);
  });

  // Past 60, YouTube ignores every hashtag on the video, so no setting may cross it.
  it('never goes past YouTube’s limit, whatever it is asked for', () => {
    const many = Array.from({ length: 100 }, (_, index) => `#tag${index}x`);
    expect(buildHashtagBlock({ game: null, topics: [], standing: many, limit: 500 }).length).toBeLessThanOrEqual(HASHTAG_HARD_LIMIT);
  });

  it('when the cap cuts, it cuts the channel habits and keeps the game', () => {
    const block = buildHashtagBlock({ game: 'Minecraft', topics: ['creeper'], standing: ['#funny', '#epic'], limit: 3 });
    expect(block).toEqual(['#minecraft', '#minecraftshorts', '#shorts']);
  });

  // Measured: the model read "Nollid" and a friend's gamertag off a lobby screen and offered both.
  it('leaves out names it was told to, however they are written', () => {
    const block = buildHashtagBlock({
      game: 'Minecraft',
      topics: ['Nollid', 'NOLLID', 'creeper'],
      standing: [],
      exclude: ['Nollid']
    });
    expect(block).not.toContain('#nollid');
    expect(block).toContain('#creeper');
  });

  it('still produces something with no game and no topics', () => {
    expect(buildHashtagBlock({ game: null, topics: [], standing: [] })).toEqual(['#shorts']);
  });
});

describe('hashtagDescription', () => {
  it('is the hashtags on one line, nothing else', () => {
    expect(hashtagDescription(['#minecraft', '#shorts'])).toBe('#minecraft #shorts');
    expect(hashtagDescription([])).toBe('');
  });
});
