// What whisper.cpp heard in a clip, read from the JSON it writes, and what ShortStack does with it.

export interface TranscriptSegment {
  /** Milliseconds from the start of the clip. */
  from: number;
  to: number;
  text: string;
}

/** "00:00:04,360" as milliseconds. */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(value.trim());
  if (match === null) return null;
  const [, hours, minutes, seconds, fraction] = match;
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number((fraction as string).padEnd(3, '0'));
}

const MAX_SEGMENT_CHARS = 400;

/** The segments in whisper-cli's `-oj` output, or null when it is not that. Blank segments are dropped. */
export function parseWhisperJson(raw: unknown): TranscriptSegment[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const transcription = (raw as { transcription?: unknown }).transcription;
  if (!Array.isArray(transcription)) return null;

  const segments: TranscriptSegment[] = [];
  for (const entry of transcription) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { offsets, timestamps, text } = entry as { offsets?: { from?: unknown; to?: unknown }; timestamps?: { from?: unknown; to?: unknown }; text?: unknown };
    if (typeof text !== 'string') continue;
    const cleaned = text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_SEGMENT_CHARS);
    // Whisper marks what it heard but could not put words to, such as music, in brackets. Not speech.
    if (cleaned === '' || /^[[(].*[\])]$/.test(cleaned)) continue;
    const from = typeof offsets?.from === 'number' ? offsets.from : parseTimestamp(timestamps?.from);
    const to = typeof offsets?.to === 'number' ? offsets.to : parseTimestamp(timestamps?.to);
    if (from === null || to === null) continue;
    segments.push({ from, to, text: cleaned });
  }
  return segments;
}

/** Everything said, in order, cut at a word boundary to fit a prompt. */
export function transcriptText(segments: readonly TranscriptSegment[], maxChars = 700): string {
  const whole = segments.map((segment) => segment.text).join(' ');
  if (whole.length <= maxChars) return whole;
  const cut = whole.slice(0, maxChars);
  // Cut exactly where a word ends: nothing to take back.
  if (whole[maxChars] === ' ') return `${cut}…`;
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

export type Backend = 'gpu' | 'cpu' | 'unknown';

/** Which hardware whisper.cpp says it ran on, from what it printed while loading. */
export function backendFromLog(log: string): Backend {
  if (/loaded CUDA backend|ggml_cuda_init: found [1-9]/i.test(log)) return 'gpu';
  if (/no GPU found|device 0: CPU/i.test(log)) return 'cpu';
  return 'unknown';
}

/** What was heard in a video, as the screen receives it. */
export interface HeardDTO {
  model: string;
  backend: Backend;
  madeAt: string;
  segments: TranscriptSegment[];
}
