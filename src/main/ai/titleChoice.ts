// Which of the model's titles a video actually gets. Pure, so the rules that keep a friend's gamertag or a
// repeated title off a video can be read and tested on their own.
import { mentionedIn } from '../../shared/blockedNames';
import { orderAngles, type TitleAngle } from '../../shared/titleAngles';
import type { TitleOption } from './metadataSuggestion';

export interface TitleChoiceInput {
  /** A title of each kind, as the model offered them. */
  offered: readonly TitleOption[];
  /** The title on its own, from a reply that sent one rather than one of each kind. */
  single: string;
  /** Names that must never appear. */
  names: readonly string[];
  /** Titles this video already went out under on other postings. */
  previous: readonly string[];
  /** The kind this channel's numbers favour, offered first. */
  leader: TitleAngle | null;
  /** What the video keeps when nothing offered is usable. */
  current: string;
}

export interface TitleChoice {
  title: string;
  titleOptions: TitleOption[];
  titleAngle: TitleAngle | null;
}

export function chooseTitles(input: TitleChoiceInput): TitleChoice {
  const used = new Set(input.previous.map((title) => title.trim().toLowerCase()));
  // A title is a sentence, and cutting a name out of one leaves it broken, so a title that names someone is
  // left out whole. So is one the video already went out under: a re-run under the same title looks like a repeat.
  const usable = (title: string): boolean =>
    title.trim() !== '' && !mentionedIn(title, input.names) && !used.has(title.trim().toLowerCase());

  const titleOptions = orderAngles(input.leader)
    .map((angle) => input.offered.find((option) => option.angle === angle))
    .filter((option): option is TitleOption => option !== undefined && usable(option.title));
  const fallback = input.offered.length === 0 && usable(input.single) ? input.single : input.current;
  return { title: titleOptions[0]?.title ?? fallback, titleOptions, titleAngle: titleOptions[0]?.angle ?? null };
}
