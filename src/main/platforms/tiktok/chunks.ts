// How a video is cut up for TikTok's FILE_UPLOAD. The sizes are TikTok's rules, not a preference. From the
// Content Posting API media transfer guide:
//   - every chunk at least 5 MB and at most 64 MB, except the last, which may be larger, up to 128 MB
//   - total_chunk_count is video_size divided by chunk_size, rounded down, so the remainder rides on the last
//   - a video under 5 MB goes up whole, with chunk_size equal to its size
//   - between 1 and 1000 chunks, uploaded in order
//
// The guide does not say whether a megabyte is 1,000,000 bytes or 1,048,576, so each limit is taken at the
// stricter reading: the smallest chunk at 5 MiB, the largest at 64,000,000 bytes.

export const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 64 * 1000 * 1000;
export const MAX_FINAL_CHUNK_BYTES = 128 * 1000 * 1000;
export const MAX_CHUNKS = 1000;
/** TikTok's own ceiling on a posted video. */
export const MAX_VIDEO_BYTES = 4 * 1000 * 1000 * 1000;
/** Big enough to keep a Short to a few requests, small enough that resending one after a dropped connection is cheap. */
export const DEFAULT_CHUNK_BYTES = 10 * 1024 * 1024;

export interface Chunk {
  index: number;
  /** First byte, inclusive. */
  start: number;
  /** Last byte, inclusive, as Content-Range counts. */
  end: number;
  length: number;
  contentRange: string;
}

export interface ChunkPlan {
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
  chunks: Chunk[];
}

export type ChunkPlanResult = { ok: true; plan: ChunkPlan } | { ok: false; reason: string };

export function planChunks(videoSize: number, preferred: number = DEFAULT_CHUNK_BYTES): ChunkPlanResult {
  if (!Number.isSafeInteger(videoSize) || videoSize <= 0) return { ok: false, reason: 'The video is empty' };
  if (videoSize > MAX_VIDEO_BYTES) return { ok: false, reason: 'TikTok takes videos up to 4 GB' };

  let chunkSize: number;
  if (videoSize < MIN_CHUNK_BYTES) {
    chunkSize = videoSize;
  } else {
    chunkSize = Math.min(Math.max(Math.floor(preferred), MIN_CHUNK_BYTES), MAX_CHUNK_BYTES);
    // Smaller than one chunk: rounding down would make no chunks at all, so it goes as one, of its own size.
    if (videoSize < chunkSize) chunkSize = videoSize;
    // Too many chunks: make each larger until there are at most a thousand.
    if (Math.floor(videoSize / chunkSize) > MAX_CHUNKS) chunkSize = Math.ceil(videoSize / MAX_CHUNKS);
  }

  const totalChunkCount = Math.floor(videoSize / chunkSize);
  const chunks: Chunk[] = [];
  for (let index = 0; index < totalChunkCount; index += 1) {
    const start = index * chunkSize;
    const end = index === totalChunkCount - 1 ? videoSize - 1 : start + chunkSize - 1;
    chunks.push({ index, start, end, length: end - start + 1, contentRange: `bytes ${start}-${end}/${videoSize}` });
  }

  const last = chunks[chunks.length - 1] as Chunk;
  if (chunkSize > MAX_CHUNK_BYTES || last.length > MAX_FINAL_CHUNK_BYTES) {
    return { ok: false, reason: 'That video cannot be split within TikTok’s chunk sizes' };
  }
  return { ok: true, plan: { videoSize, chunkSize, totalChunkCount, chunks } };
}
