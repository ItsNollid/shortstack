// Reads duration and display dimensions straight from the MP4/MOV container, so the queue can
// show real numbers and warn about videos YouTube would not treat as Shorts. No ffmpeg needed.
import * as fs from 'fs/promises';

export interface VideoProbe {
  durationS: number | null;
  width: number | null;
  height: number | null;
}

export interface BoxRef {
  type: string;
  /** Payload bounds, excluding the header. */
  start: number;
  end: number;
}

const EMPTY: VideoProbe = { durationS: null, width: null, height: null };

/** Walks the boxes in a buffer. Sizes may be 32-bit, 64-bit (size === 1), or "to the end" (size === 0). */
export function* boxes(buffer: Buffer, from = 0, to = buffer.length): Generator<BoxRef> {
  let offset = from;
  while (offset + 8 <= to) {
    const size32 = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > to) return;
      const large = buffer.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return;
      size = Number(large);
      headerSize = 16;
    } else if (size32 === 0) {
      size = to - offset;
    }
    if (size < headerSize || offset + size > to) {
      yield { type, start: offset + headerSize, end: to };
      return;
    }
    yield { type, start: offset + headerSize, end: offset + size };
    offset += size;
  }
}

function findBox(buffer: Buffer, type: string, from = 0, to = buffer.length): BoxRef | null {
  for (const box of boxes(buffer, from, to)) if (box.type === type) return box;
  return null;
}

const fixed1616 = (buffer: Buffer, offset: number): number => buffer.readUInt32BE(offset) / 65536;

/** A truncated file can leave a header sitting exactly at the end with no payload behind it, so
 *  every read is checked against the box's own bounds first rather than against the file's. */
const has = (box: BoxRef, bytes: number): boolean => box.start + bytes <= box.end;

function parseMvhd(buffer: Buffer, box: BoxRef): number | null {
  if (!has(box, 1)) return null;
  const version = buffer.readUInt8(box.start);
  const body = box.start + 4;
  if (version === 1) {
    if (body + 28 > box.end) return null;
    const timescale = buffer.readUInt32BE(body + 16);
    const duration = Number(buffer.readBigUInt64BE(body + 20));
    return timescale > 0 ? duration / timescale : null;
  }
  if (body + 16 > box.end) return null;
  const timescale = buffer.readUInt32BE(body + 8);
  const duration = buffer.readUInt32BE(body + 12);
  return timescale > 0 ? duration / timescale : null;
}

function parseTkhd(buffer: Buffer, box: BoxRef): { width: number; height: number } | null {
  if (!has(box, 1)) return null;
  const version = buffer.readUInt8(box.start);
  const afterTimes = box.start + 4 + (version === 1 ? 32 : 20);
  const matrix = afterTimes + 16; // reserved(8) + layer(2) + alternate_group(2) + volume(2) + reserved(2)
  const dimensions = matrix + 36;
  if (dimensions + 8 > box.end) return null;

  const width = fixed1616(buffer, dimensions);
  const height = fixed1616(buffer, dimensions + 4);
  if (width <= 0 || height <= 0) return null;

  // A phone recording is often stored landscape with a 90 degree rotation matrix.
  const a = buffer.readInt32BE(matrix) / 65536;
  const b = buffer.readInt32BE(matrix + 4) / 65536;
  const rotatedQuarterTurn = Math.abs(a) < 0.001 && Math.abs(b) > 0.001;
  return rotatedQuarterTurn ? { width: height, height: width } : { width, height };
}

/** Parses the payload of a moov box. */
export function parseMoov(moov: Buffer): VideoProbe {
  const result: VideoProbe = { ...EMPTY };
  const mvhd = findBox(moov, 'mvhd');
  if (mvhd !== null) result.durationS = parseMvhd(moov, mvhd);

  for (const trak of boxes(moov)) {
    if (trak.type !== 'trak') continue;
    const mdia = findBox(moov, 'mdia', trak.start, trak.end);
    const handler = mdia === null ? null : findBox(moov, 'hdlr', mdia.start, mdia.end);
    if (handler !== null && (!has(handler, 12) || moov.toString('latin1', handler.start + 8, handler.start + 12) !== 'vide')) {
      continue;
    }

    const tkhd = findBox(moov, 'tkhd', trak.start, trak.end);
    const dimensions = tkhd === null ? null : parseTkhd(moov, tkhd);
    if (dimensions !== null) {
      result.width = Math.round(dimensions.width);
      result.height = Math.round(dimensions.height);
      break;
    }
  }
  return result;
}

/** Locates the moov box by walking top-level headers, so files with moov at the end work too. */
export async function probeVideoFile(filePath: string, maxMoovBytes = 64 * 1024 * 1024): Promise<VideoProbe> {
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(filePath, 'r');
    const { size } = await handle.stat();
    let offset = 0;
    const header = Buffer.alloc(16);

    while (offset + 8 <= size) {
      const { bytesRead } = await handle.read(header, 0, 16, offset);
      if (bytesRead < 8) return EMPTY;
      const size32 = header.readUInt32BE(0);
      const type = header.toString('latin1', 4, 8);
      let headerSize = 8;
      let boxSize = size32;
      if (size32 === 1) {
        if (bytesRead < 16) return EMPTY;
        const large = header.readBigUInt64BE(8);
        // Past this, arithmetic on the offset stops being exact. Same guard the in-memory walk uses.
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) return EMPTY;
        boxSize = Number(large);
        headerSize = 16;
      } else if (size32 === 0) {
        boxSize = size - offset;
      }
      if (boxSize < headerSize) return EMPTY;

      if (type === 'moov') {
        // The size in the header is a claim. Allocate against what the file can actually supply, so
        // a short file declaring a huge box costs nothing.
        const available = Math.max(0, size - (offset + headerSize));
        const payloadSize = Math.min(boxSize - headerSize, available, maxMoovBytes);
        const moov = Buffer.alloc(payloadSize);
        await handle.read(moov, 0, payloadSize, offset + headerSize);
        return parseMoov(moov);
      }
      offset += boxSize;
    }
    return EMPTY;
  } catch {
    return EMPTY;
  } finally {
    await handle?.close();
  }
}
