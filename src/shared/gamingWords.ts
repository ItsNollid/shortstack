// Word lists for checking a gaming Short's description.
//
// Measured against the bundled English dictionary: "gameplay", "headshot", "respawn", "noob",
// "speedrun" and "youtube" are all reported as misspelled, and asked for suggestions for "gamertag"
// it spent 0.4 seconds and offered nothing. Each word below would otherwise be flagged on nearly
// every video this channel posts.

/** Spelled correctly, though the dictionary has never heard of them. Lowercase. */
export const GAMING_WORDS: readonly string[] = [
  // Platforms and formats
  'youtube', 'youtuber', 'youtubers', 'yt', 'ytshorts', 'shorts', 'livestream', 'livestreams', 'livestreaming',
  'streamer', 'streamers', 'twitch', 'discord', 'vod', 'vods', 'irl', 'pov', 'asmr', 'vlog', 'vlogs',
  // Playing
  'gameplay', 'gamer', 'gamers', 'gamertag', 'gamertags', 'speedrun', 'speedruns', 'speedrunner', 'speedrunning',
  'headshot', 'headshots', 'respawn', 'respawned', 'respawning', 'respawns', 'spawnkill', 'noob', 'noobs', 'nerf',
  'nerfed', 'buffed', 'loadout', 'loadouts', 'killstreak', 'killstreaks', 'noscope', 'quickscope', 'wallbang',
  'clutched', 'afk', 'laggy', 'ragequit', 'tryhard', 'tryhards', 'sweaty', 'modded', 'multiplayer', 'singleplayer',
  'coop', 'pvp', 'pve', 'fps', 'rpg', 'mmo', 'dlc', 'npc', 'npcs', 'xp', 'hp', 'gg', 'ez', 'op', 'bossfight',
  'easteregg', 'eastereggs', 'friendslop', 'letsplay', 'playthrough', 'jumpscare', 'jumpscares', 'minigame', 'minigames',
  // Talking
  'lol', 'lmao', 'lmfao', 'omg', 'bruh', 'sus', 'rizz', 'goated', 'lowkey', 'highkey', 'ngl', 'tbh', 'fr', 'gonna',
  'wanna', 'gotta', 'kinda', 'sorta', 'yall', 'meme', 'memes',
  // Call of Duty zombies, the game this channel has posted most
  'bo1', 'bo2', 'bo3', 'bo4', 'bo6', 'cod', 'codzombies', 'packapunch', 'wonderweapon', 'wonderweapons', 'perkacola',
  'perkacolas', 'juggernog', 'staminup', 'quickrevive', 'doubletap', 'mulekick', 'gobblegum', 'gobblegums', 'nuketown',
  'warzone',
  // The other games the channel plays or means to
  'cs2', 'csgo', 'counterstrike', 'minecraft', 'netherite', 'redstone', 'gta', 'gta5', 'gta6', 'gtav', 'gtaonline',
  'fortnite', 'roblox', 'valorant', 'gmod', 'phasmo', 'phasmophobia', 'amongus', 'lethalcompany'
];

/**
 * Two-letter words allowed inside a hashtag. The dictionary accepts hundreds of two-letter strings —
 * "ts", "em", "mo" — and with all of them almost any typo splits into "words".
 */
export const TWO_LETTER_WORDS: ReadonlySet<string> = new Set([
  'of', 'in', 'on', 'to', 'up', 'go', 'my', 'me', 'we', 'us', 'it', 'is', 'at', 'by', 'no', 'so', 'do', 'be', 'he',
  'or', 'an', 'as', 'if', 'ok', 'hi', 'oh', 'yo', 'ya', 'gg', 'ez', 'op', 'xp', 'hp', 'yt', 'tv', 'pc', 'vs', 'mc',
  'ai', 'vr', 'uk'
]);

/**
 * Three-letter words ordinary enough that a hashtag leaning on one is not suspicious. Without this,
 * "subscirbe" passes as subs + cir + be; with it, "cir" beside "be" gives the typo away, while
 * #howtogo and #xpfarm still read as words.
 */
export const COMMON_SHORT_WORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'you', 'how', 'who', 'why', 'all', 'one', 'two', 'six', 'ten', 'new', 'old', 'big', 'top', 'pro',
  'win', 'won', 'fun', 'god', 'mom', 'dad', 'man', 'men', 'guy', 'day', 'end', 'run', 'gun', 'war', 'ops', 'cod', 'kid',
  'bad', 'mad', 'sad', 'hot', 'low', 'max', 'air', 'sea', 'sky', 'box', 'map', 'car', 'cat', 'dog', 'pet', 'egg', 'eat',
  'die', 'try', 'got', 'get', 'let', 'out', 'off', 'now', 'not', 'yes', 'lot', 'way', 'own', 'see', 'saw', 'say', 'can',
  'may', 'act', 'age', 'art', 'ask', 'bed', 'bet', 'boy', 'buy', 'cut', 'did', 'far', 'fly', 'fix', 'hat', 'hit', 'ice',
  'job', 'key', 'law', 'leg', 'lie', 'mix', 'net', 'oil', 'pay', 'put', 'raw', 'red', 'rip', 'sit', 'son', 'sun', 'tip',
  'toy', 'use', 'web', 'zoo', 'lit', 'sus', 'bro', 'fan', 'hey', 'lol', 'omg', 'wow', 'yay', 'fps', 'rpg', 'mmo', 'dlc',
  'npc', 'afk', 'bo3', 'gta', 'cs2', 'pog', 'her', 'his', 'our', 'are', 'was', 'has', 'had', 'too', 'any', 'few'
]);

/** Misspellings common enough to fix without asking. The dictionary's own first guess for "teh" is "ten". */
export const COMMON_TYPOS: Readonly<Record<string, string>> = {
  teh: 'the', hte: 'the', adn: 'and', nad: 'and', taht: 'that', thta: 'that', waht: 'what', wiht: 'with', jsut: 'just',
  mroe: 'more', yuo: 'you', becuase: 'because', beacuse: 'because', recieve: 'receive', recieved: 'received',
  definately: 'definitely', definetly: 'definitely', defintely: 'definitely', seperate: 'separate', occured: 'occurred',
  untill: 'until', wierd: 'weird', thier: 'their', freind: 'friend', freinds: 'friends', beleive: 'believe',
  tommorow: 'tomorrow', tomorow: 'tomorrow', realy: 'really', finaly: 'finally', basicly: 'basically',
  probaly: 'probably', suprise: 'surprise', subsribe: 'subscribe', subcribe: 'subscribe', subscibe: 'subscribe',
  comming: 'coming', begining: 'beginning', noone: 'no one', alot: 'a lot', wich: 'which', whith: 'with'
};

/** Contractions typed without their apostrophe. Only ones that are not also real words — "cant", "wont", "ill" are. */
export const MISSING_APOSTROPHES: Readonly<Record<string, string>> = {
  dont: "don't", doesnt: "doesn't", didnt: "didn't", isnt: "isn't", wasnt: "wasn't", arent: "aren't",
  werent: "weren't", couldnt: "couldn't", shouldnt: "shouldn't", wouldnt: "wouldn't", havent: "haven't",
  hasnt: "hasn't", hadnt: "hadn't", youre: "you're", theyre: "they're", thats: "that's", whats: "what's",
  ive: "I've", youve: "you've", weve: "we've", theyve: "they've", youll: "you'll", theyll: "they'll",
  wouldve: "would've", couldve: "could've", shouldve: "should've", im: "I'm", hes: "he's", shes: "she's"
};

/** Hashtags that belong to another app. On a YouTube video they are unrelated by definition. */
export const OTHER_PLATFORM_HASHTAGS: ReadonlySet<string> = new Set([
  'fyp', 'fy', 'fypage', 'foryou', 'foryoupage', 'fypシ', 'reels', 'reel', 'instareels', 'igreels', 'reelsinstagram',
  'xyzbca', 'capcut', 'facebookreels', 'fbreels', 'explorepage'
]);

/** Any hashtag containing one of these names another app, whatever surrounds it: #viraltiktok, #tiktokdance. */
export const OTHER_PLATFORM_NAMES: readonly string[] = ['tiktok', 'instagram', 'snapchat', 'capcut'];
