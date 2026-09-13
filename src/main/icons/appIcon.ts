// Puts the connected channel's picture on the window, the taskbar and the tray, and takes it off
// again when the channel is disconnected.
//
// setIcon does repaint the taskbar button on Windows 11, confirmed against an installed build, so
// the channel picture goes there. The overlay badge is then free to carry what the icon cannot:
// whether ShortStack is stopped or wants something. Putting the avatar in both was a picture on top
// of the same picture.
import { app, nativeImage, net, type BrowserWindow, type NativeImage, type Tray } from 'electron';
import * as path from 'path';
import { brandIconPng } from '../brandIcon';
import { bgraToRgba } from './circle';
import { drawStatusOverlay, statusFor, type IconStatus } from './statusOverlay';
import {
  clearIconCache,
  fetchChannelIcons,
  readIconCache,
  writeIconCache,
  type Decoder,
  type IconSet
} from './channelIcon';

const TASKBAR_SIZE = 256;
const OVERLAY_SIZE = 32;
const TRAY_SIZE = 16;

/** Chromium decodes PNG and JPEG; anything else (WebP, SVG) comes back empty and we keep the mark. */
const decode: Decoder = (bytes, size) => {
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) return null;
  const bitmap = image.resize({ width: size, height: size, quality: 'best' }).toBitmap();
  return bitmap.length === size * size * 4 ? bgraToRgba(bitmap) : null;
};

const fetchBytes = async (url: string): Promise<Buffer | null> => {
  try {
    const response = await net.fetch(url, { headers: { Accept: 'image/png,image/jpeg' } });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (!/^image\/(png|jpeg)/i.test(type)) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
};

export interface AppIconTargets {
  window(): BrowserWindow | null;
  tray(): Tray | null;
  /** Where the cached icons live; cleared when the channel is disconnected. */
  cacheDir: string;
}

export class AppIcon {
  private set: IconSet | null = null;
  private status: IconStatus = 'running';

  constructor(private readonly targets: AppIconTargets) {}

  private image(size: number): NativeImage | null {
    const png = this.set?.pngs.get(size);
    return png === undefined ? null : nativeImage.createFromBuffer(png);
  }

  /** Loads whatever was cached last time. Called before the window is shown, so an app that starts
   *  hidden in the tray still comes up wearing the right face. */
  async restore(): Promise<boolean> {
    this.set = await readIconCache(this.targets.cacheDir);
    if (this.set === null) return false;
    this.apply();
    return true;
  }

  /** Fetches the channel picture and applies it. Returns false when the picture could not be used,
   *  in which case whatever is showing stays. */
  async refresh(avatarUrl: string | null): Promise<boolean> {
    if (avatarUrl === null || avatarUrl === '') return false;
    const set = await fetchChannelIcons(avatarUrl, { get: fetchBytes, decode });
    if (set === null) return false;
    this.set = set;
    await writeIconCache(this.targets.cacheDir, set).catch(() => undefined);
    this.apply();
    return true;
  }

  apply(): void {
    const window = this.targets.window();
    const large = this.image(TASKBAR_SIZE);
    const small = this.image(TRAY_SIZE);

    if (window !== null && large !== null) window.setIcon(large);
    this.applyStatusOverlay();
    this.targets.tray()?.setImage(small ?? nativeImage.createFromBuffer(brandIconPng(TRAY_SIZE)));

    // The relaunch entry Windows keeps for a pinned app needs all three parts together, and an
    // icon it can read from disk rather than from memory. It lives on the window, not on app.
    if (process.platform === 'win32' && this.set !== null && app.isPackaged && window !== null) {
      window.setAppDetails({
        appId: 'com.shortstack.app',
        relaunchDisplayName: 'ShortStack',
        relaunchCommand: `"${process.execPath}"`,
        appIconPath: path.join(this.targets.cacheDir, 'channel.ico'),
        appIconIndex: 0
      });
    }
  }

  /** The corner badge: paused or needing attention, and nothing at all when all is well. */
  setStatus(state: { paused: boolean; needsAttention: boolean }): void {
    this.status = statusFor(state);
    this.applyStatusOverlay();
  }

  private applyStatusOverlay(): void {
    if (process.platform !== 'win32') return;
    const window = this.targets.window();
    if (window === null) return;

    if (this.status === 'running') {
      window.setOverlayIcon(null, '');
      return;
    }
    const description = this.status === 'paused' ? 'Uploads are paused' : 'Something needs your attention';
    window.setOverlayIcon(nativeImage.createFromBuffer(drawStatusOverlay(this.status, OVERLAY_SIZE)), description);
  }

  /** Back to the ShortStack mark, and the channel picture off the disk. */
  async clear(): Promise<void> {
    this.set = null;
    await clearIconCache(this.targets.cacheDir);
    const window = this.targets.window();
    window?.setIcon(nativeImage.createFromBuffer(brandIconPng(TASKBAR_SIZE)));
    if (process.platform === 'win32') window?.setOverlayIcon(null, '');
    this.targets.tray()?.setImage(nativeImage.createFromBuffer(brandIconPng(TRAY_SIZE)));
  }
}
