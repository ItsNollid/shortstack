// Builds the app's icon from the connected channel's picture, and remembers it on disk so a launch
// that starts hidden in the tray still shows the right icon before any network call.
import * as fs from 'fs/promises';
import * as path from 'path';
import { encodePng } from '../brandIcon';
import { avatarUrlAtSize, circleMask, icoFromPngs } from './circle';

/** Windows picks whichever of these fits the surface it is drawing. */
export const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256] as const;

export interface IconSet {
  /** Circular PNGs by pixel size. */
  pngs: Map<number, Buffer>;
  /** The same images in one .ico, for surfaces that need a file path. */
  ico: Buffer;
}

/** Decodes image bytes to square RGBA pixels. Backed by Chromium in the app; a stub in tests. */
export type Decoder = (bytes: Buffer, size: number) => Buffer | null;

export function buildIconSet(bytes: Buffer, decode: Decoder): IconSet | null {
  const pngs = new Map<number, Buffer>();
  for (const size of ICON_SIZES) {
    const rgba = decode(bytes, size);
    // One unreadable size means the picture is not usable; a half-built set would look worse than
    // keeping the ShortStack mark.
    if (rgba === null || rgba.length !== size * size * 4) return null;
    pngs.set(size, encodePng(size, size, circleMask(rgba, size)));
  }
  const ico = icoFromPngs([...pngs].map(([size, png]) => ({ size, png })));
  return { pngs, ico };
}

const pngPath = (dir: string, size: number): string => path.join(dir, `channel-${size}.png`);
const icoPath = (dir: string): string => path.join(dir, 'channel.ico');

export async function writeIconCache(dir: string, set: IconSet): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await Promise.all([...set.pngs].map(([size, png]) => fs.writeFile(pngPath(dir, size), png)));
  await fs.writeFile(icoPath(dir), set.ico);
}

export async function readIconCache(dir: string): Promise<IconSet | null> {
  try {
    const pngs = new Map<number, Buffer>();
    for (const size of ICON_SIZES) pngs.set(size, await fs.readFile(pngPath(dir, size)));
    return { pngs, ico: await fs.readFile(icoPath(dir)) };
  } catch {
    return null;
  }
}

/** Part of disconnecting: the channel picture is the user's data and does not outlive the link. */
export async function clearIconCache(dir: string): Promise<void> {
  await Promise.all(
    [...ICON_SIZES.map((size) => pngPath(dir, size)), icoPath(dir)].map((file) =>
      fs.rm(file, { force: true }).catch(() => undefined)
    )
  );
}

export interface FetchAvatarDeps {
  /** Returns the bytes, or null for anything that is not a picture we can read. */
  get(url: string): Promise<Buffer | null>;
  decode: Decoder;
}

/** Fetches the channel picture at the largest size we draw and turns it into the icon set. */
export async function fetchChannelIcons(avatarUrl: string, deps: FetchAvatarDeps): Promise<IconSet | null> {
  const bytes = await deps.get(avatarUrlAtSize(avatarUrl, 256));
  return bytes === null ? null : buildIconSet(bytes, deps.decode);
}
