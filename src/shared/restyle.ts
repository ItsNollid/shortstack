// House style is applied when details are saved, so videos already waiting keep whatever style was in
// force when they were written. Measured on the live channel: the title rule was ALL CAPS, and two of
// the four waiting titles were not. This is what bringing them into line would change.

export interface TextChange {
  before: string;
  after: string;
}

/** A waiting video whose details the current house style would change, and how. */
export interface RestyleChange {
  id: number;
  title: TextChange | null;
  description: TextChange | null;
  tagsChanged: boolean;
}

export interface RestyleResult {
  changed: number;
  /** Changed or uploaded since the preview, or no longer valid once formatted. Left as they were. */
  skipped: number;
}
