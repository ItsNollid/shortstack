// Turning YouTube's report keys into words. The API answers with things like SHORTS, YT_SEARCH and
// age25-34, and putting those on screen makes a page look like a database dump. Anything unknown is
// tidied rather than hidden, because a source this does not recognise is still a real source.

const TRAFFIC_SOURCES: Record<string, string> = {
  SHORTS: 'Shorts feed',
  SUBSCRIBER: 'Subscriptions and home',
  YT_SEARCH: 'YouTube search',
  RELATED_VIDEO: 'Suggested videos',
  EXT_URL: 'Links from other sites',
  NO_LINK_OTHER: 'Direct or unknown',
  NO_LINK_EMBEDDED: 'Embedded elsewhere',
  PLAYLIST: 'Playlists',
  YT_CHANNEL: 'Your channel page',
  NOTIFICATION: 'Notifications',
  ADVERTISING: 'Advertising',
  PROMOTED: 'Promoted',
  ANNOTATION: 'Annotations',
  CAMPAIGN_CARD: 'Campaign cards',
  END_SCREEN: 'End screens',
  VIDEO_REMIXES: 'Remixes of your videos',
  HASHTAGS: 'Hashtag pages',
  SOUND_PAGE: 'Sound pages',
  YT_OTHER_PAGE: 'Elsewhere on YouTube'
};

/** Only the ones likely to show up; everything else falls back to the code itself. */
const COUNTRIES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  IN: 'India',
  DE: 'Germany',
  FR: 'France',
  BR: 'Brazil',
  MX: 'Mexico',
  PH: 'Philippines',
  NL: 'Netherlands',
  ES: 'Spain',
  IT: 'Italy',
  PL: 'Poland',
  SE: 'Sweden',
  IE: 'Ireland',
  NZ: 'New Zealand',
  ZA: 'South Africa',
  JP: 'Japan',
  KR: 'South Korea'
};

/** "NO_LINK_OTHER" reads better as "No link other" than as itself. */
const humanise = (key: string): string => {
  const words = key.replace(/_/g, ' ').trim().toLowerCase();
  return words === '' ? 'Unknown' : words.charAt(0).toUpperCase() + words.slice(1);
};

export const trafficSourceName = (key: string): string => TRAFFIC_SOURCES[key] ?? humanise(key);

export const countryName = (key: string): string => COUNTRIES[key] ?? (key.trim() === '' ? 'Unknown' : key);

/** "age25-34" is how YouTube spells it; "25 to 34" is how a person does. */
export function ageGroupName(key: string): string {
  const match = /^age(\d+)-(\d+)$/.exec(key);
  if (match !== null) return `${match[1]} to ${match[2]}`;
  const plus = /^age(\d+)-?$/.exec(key);
  if (plus !== null) return `${plus[1]} and over`;
  return humanise(key);
}

export const genderName = (key: string): string => {
  const lower = key.toLowerCase();
  if (lower === 'male') return 'Men';
  if (lower === 'female') return 'Women';
  return humanise(key);
};

/** Seconds as something readable at a glance: Shorts are measured in seconds, not hours. */
export function duration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole}s`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** A share of a total, guarding the case that makes every dashboard print NaN. */
export const percentOf = (part: number, total: number): number => (total <= 0 ? 0 : (part / total) * 100);
