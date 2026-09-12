import { BrowserWindow, app, nativeImage, shell } from 'electron';
import * as path from 'path';
import { runtimeProfile } from './bootstrap/profile';
import { brandIconPng } from './brandIcon';

export interface WindowDeps {
  /** True when closing should hide to the tray instead of quitting. */
  hideOnClose(): boolean;
  isQuitting(): boolean;
}

const TITLE_BAR_BACKGROUND = '#0f0f0f';
const TITLE_BAR_SYMBOLS = '#f1f1f1';

export function createMainWindow(deps: WindowDeps): BrowserWindow {
  const window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: TITLE_BAR_BACKGROUND,
    icon: nativeImage.createFromBuffer(brandIconPng(256)),
    // The app draws its own title bar but keeps Windows' real buttons, so snap layouts still work.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: TITLE_BAR_BACKGROUND, symbolColor: TITLE_BAR_SYMBOLS, height: 36 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once('ready-to-show', () => window.show());

  // On the dev profile, renderer errors go to the terminal. A blank window with a silent console is
  // the worst way to find out something was blocked.
  if (runtimeProfile.profile === 'dev') {
    window.webContents.on('console-message', (event) => {
      if (event.level === 'error' || event.level === 'warning') {
        console.info(`[renderer:${event.level}] ${event.message}`);
      }
    });
    window.webContents.on('did-fail-load', (_event, code, description) => {
      console.error(`[renderer] failed to load (${code}): ${description}`);
    });
  }

  // Links open in the real browser. Without this, target=_blank opened a second Electron window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Dropping a file on the window, or any stray link, must never navigate the app away from itself.
  window.webContents.on('will-navigate', (event, url) => {
    const developmentUrl = process.env.ELECTRON_RENDERER_URL;
    const allowed = developmentUrl !== undefined && url.startsWith(developmentUrl);
    if (!allowed) {
      event.preventDefault();
      if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  window.on('close', (event) => {
    if (deps.isQuitting() || !deps.hideOnClose()) return;
    event.preventDefault();
    window.hide();
  });

  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && developmentUrl !== undefined) void window.loadURL(developmentUrl);
  else void window.loadFile(path.join(__dirname, '../renderer/index.html'));

  return window;
}
