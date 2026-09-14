import { describe, expect, it } from 'vitest';
import { MAX_CHUNKS, MAX_FINAL_CHUNK_BYTES, MIN_CHUNK_BYTES, planChunks, type ChunkPlan } from './chunks';

const MiB = 1024 * 1024;

const plan = (size: number, preferred?: number): ChunkPlan => {
  const result = planChunks(size, preferred);
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
};

/** What TikTok checks: whole coverage, in order, with no gaps, and the count rounded down. */
function expectValid(result: ChunkPlan): void {
  expect(result.totalChunkCount).toBe(Math.floor(result.videoSize / result.chunkSize));
  expect(result.chunks).toHaveLength(result.totalChunkCount);
  expect(result.totalChunkCount).toBeGreaterThanOrEqual(1);
  expect(result.totalChunkCount).toBeLessThanOrEqual(MAX_CHUNKS);
  let next = 0;
  result.chunks.forEach((chunk, index) => {
    expect(chunk.start).toBe(next);
    expect(chunk.contentRange).toBe(`bytes ${chunk.start}-${chunk.end}/${result.videoSize}`);
    if (index < result.chunks.length - 1) expect(chunk.length).toBe(result.chunkSize);
    next = chunk.end + 1;
  });
  expect(next).toBe(result.videoSize);
  expect(result.chunks[result.chunks.length - 1]?.length).toBeLessThanOrEqual(MAX_FINAL_CHUNK_BYTES);
}

describe('cutting a video up for TikTok', () => {
  it('sends a video under 5 MB whole', () => {
    const small = plan(4 * MiB);
    expect(small).toMatchObject({ chunkSize: 4 * MiB, totalChunkCount: 1 });
    expectValid(small);
  });

  it('puts the remainder on the last chunk rather than sending a short one', () => {
    const result = plan(25 * MiB);
    expect(result.chunks.map((chunk) => chunk.length)).toEqual([10 * MiB, 15 * MiB]);
    expectValid(result);
  });

  it('sends a video between 5 MB and one chunk as one chunk of its own size', () => {
    const result = plan(7 * MiB);
    expect(result).toMatchObject({ chunkSize: 7 * MiB, totalChunkCount: 1 });
    expectValid(result);
  });

  // The largest of this channel's sample clips.
  it('splits a 164 MB clip into ten-megabyte chunks with the rest on the last', () => {
    const result = plan(164_341_461);
    expect(result.totalChunkCount).toBe(15);
    expect(result.chunks[14]?.contentRange).toBe(`bytes ${14 * 10 * MiB}-164341460/164341461`);
    expectValid(result);
  });

  it('keeps a requested size within what TikTok allows', () => {
    expect(plan(200 * MiB, 1 * MiB).chunkSize).toBe(MIN_CHUNK_BYTES);
    expect(plan(900 * MiB, 500 * MiB).chunkSize).toBe(64_000_000);
  });

  it('makes chunks larger rather than send more than a thousand', () => {
    const result = plan(3_900_000_000, MIN_CHUNK_BYTES);
    expect(result.totalChunkCount).toBeLessThanOrEqual(MAX_CHUNKS);
    expectValid(result);
  });

  it('refuses an empty video and one over 4 GB', () => {
    expect(planChunks(0)).toMatchObject({ ok: false });
    expect(planChunks(4_000_000_001)).toMatchObject({ ok: false });
  });
});
