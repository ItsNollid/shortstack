// Puts the connected channel's picture on the window, the taskbar and the tray, and takes it off
// again when the channel is disconnected.
//
// Windows is not consistent about which of these a running app may change. The window icon (title
// bar, Alt+Tab) follows setIcon reliably; whether the taskbar button follows it depends on how the
// app was launched and whether it is pinned. setOverlayIcon is the one that always shows, so the
// avatar goes there too. Nothing here depends on which of them wins.
import { app, nativeImage, net, type BrowserWindow, type NativeImage, type Tray } from 'electron';
import * as path from 'path';
import { brandIconPng } from '../brandIcon';
import { bgraToRgba } from './circle';
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
    const overlay = this.image(OVERLAY_SIZE);
    const small = this.image(TRAY_SIZE);

    if (window !== null && large !== null) window.setIcon(large);
    if (window !== null && overlay !== null && process.platform === 'win32') {
      window.setOverlayIcon(overlay, 'Connected channel');
    }
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
