// What a previously published video looks like when it is offered as a source of details to reuse.
import type { Privacy } from './queue';

export interface PastUpload {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  privacy: Privacy;
}

export interface PastUploadPage {
  items: PastUpload[];
  /** Pass back to ask for the next page, or null when there are no more. */
  nextPageToken: string | null;
}

/** The fields that can be copied onto a queued video. Visibility and schedule are deliberately not
 *  among them: those are decisions about this posting, not facts about the old one. */
export interface CopyableDetails {
  title: string;
  description: string;
  tags: string[];
  categoryId: string | null;
}

export function copyableFrom(upload: PastUpload): CopyableDetails {
  return {
    title: upload.title,
    description: upload.description,
    tags: upload.tags,
    categoryId: upload.categoryId
  };
}

/** Narrows the list as the user types, over the text they can actually see. */
export function matchesSearch(upload: PastUpload, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === '') return true;
  return (
    upload.title.toLowerCase().includes(needle) ||
    upload.description.toLowerCase().includes(needle) ||
    upload.tags.some((tag) => tag.toLowerCase().includes(needle))
  );
}
