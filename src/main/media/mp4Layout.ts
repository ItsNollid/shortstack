// Checks a finished MP4 against the two layout rules Instagram states and ffprobe does not report: the index
// (moov) before the picture data (mdat), and no edit lists. Read from the file itself, a few bytes at a time.
import * as fs from 'fs/promises';
import { boxes } from '../files/videoProbe';

export interface TopLevelBox {
  type: string;
  offset: number;
  size: number;
}

/** The boxes at the top of a file, in order, reading only their headers. */
export async function readTopLevelBoxes(filePath: string, limit = 64): Promise<TopLevelBox[]> {
  const handle = await fs.open(filePath, 'r');
  try {
    const { size: fileSize } = await handle.stat();
    const header = Buffer.alloc(16);
    const found: TopLevelBox[] = [];
    let offset = 0;
    while (offset + 8 <= fileSize && found.length < limit) {
      const { bytesRead } = await handle.read(header, 0, 16, offset);
      if (bytesRead < 8) break;
      const size32 = header.readUInt32BE(0);
      let size = size32;
      if (size32 === 1) {
        if (bytesRead < 16) break;
        size = Number(header.readBigUInt64BE(8));
      } else if (size32 === 0) {
        size = fileSize - offset;
      }
      if (size < 8) break;
      found.push({ type: header.toString('latin1', 4, 8), offset, size });
      offset += size;
    }
    return found;
  } finally {
    await handle.close();
  }
}

/** True when the index comes before the picture data, which is what lets a platform read it without the whole file. */
export function indexBeforeData(top: readonly TopLevelBox[]): boolean {
  const moov = top.findIndex((box) => box.type === 'moov');
  const mdat = top.findIndex((box) => box.type === 'mdat');
  return moov !== -1 && (mdat === -1 || moov < mdat);
}

const CONTAINERS = new Set(['moov', 'trak', 'edts']);

function containsEditList(buffer: Buffer, from: number, to: number): boolean {
  for (const box of boxes(buffer, from, to)) {
    if (box.type === 'elst') return true;
    if (CONTAINERS.has(box.type) && containsEditList(buffer, box.start, box.end)) return true;
  }
  return false;
}

/** Whether any track in the file has an edit list. Null when there is no index to look in. */
export async function hasEditLists(filePath: string, top?: readonly TopLevelBox[], maxIndexBytes = 64 * 1024 * 1024): Promise<boolean | null> {
  const layout = top ?? (await readTopLevelBoxes(filePath));
  const moov = layout.find((box) => box.type === 'moov');
  if (moov === undefined || moov.size > maxIndexBytes) return null;
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(moov.size);
    await handle.read(buffer, 0, moov.size, moov.offset);
    return containsEditList(buffer, 0, buffer.length);
  } finally {
    await handle.close();
  }
}
