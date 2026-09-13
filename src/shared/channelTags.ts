// Telling a channel's standing vocabulary apart from one video's claims.
//
// Asking a model not to copy a hashtag it can see does not work. Given examples ending in
// "#round100", qwen3-vl:8b put "#round50" on a video that was a lobby screen, and a blunter
// instruction only changed which number it invented. The fix is to stop showing it the ones it must
// not copy, which needs a way to tell them apart.
//
// The signal is repetition. A hashtag on most of a channel's uploads describes the channel —
// #blackops3zombies, #codzombies, #shorts. One that appears once describes that video —
// #round100, #round50easteregg. Reusing the first kind is right; reusing the second is a lie.

export interface TagVocabulary {
  /** Hashtags used across several uploads, safe to put on anything this channel posts. */
  standing: string[];
  /** Hashtags seen once, which are claims about one video. */
  oneOff: string[];
}

const HASHTAG = /#[\p{L}\p{N}_]+/gu;

export const hashtagsIn = (text: string): string[] => text.match(HASHTAG) ?? [];

/**
 * A hashtag has to appear in at least `minUses` of the descriptions to count as standing. Two is
 * enough: appearing twice is already a pattern, and a channel's own examples are few.
 */
export function tagVocabulary(descriptions: readonly string[], minUses = 2): TagVocabulary {
  const counts = new Map<string, { count: number; spelling: string }>();

  for (const description of descriptions) {
    // Counted once per description: the same tag twice in one does not make it a habit.
    const inThisOne = new Set<string>();
    for (const tag of hashtagsIn(description)) {
      const key = tag.toLowerCase();
      if (inThisOne.has(key)) continue;
      inThisOne.add(key);
      const existing = counts.get(key);
      if (existing === undefined) counts.set(key, { count: 1, spelling: tag });
      else existing.count += 1;
    }
  }

  const standing: string[] = [];
  const oneOff: string[] = [];
  for (const { count, spelling } of counts.values()) {
    (count >= minUses ? standing : oneOff).push(spelling);
  }
  return { standing, oneOff };
}

/** An example description with the one-video hashtags taken out, so there is nothing to copy. */
export function withoutOneOffTags(description: string, vocabulary: TagVocabulary): string {
  const drop = new Set(vocabulary.oneOff.map((tag) => tag.toLowerCase()));
  if (drop.size === 0) return description;

  return description
    .replace(HASHTAG, (tag) => (drop.has(tag.toLowerCase()) ? '' : tag))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
