// "Start with Windows" was a switch that stored a value and changed nothing. This is the part that
// makes it true, kept separate so the decision is testable without Electron.
import { app } from 'electron';
import { runtimeProfile } from './bootstrap/profile';

export interface LoginItem {
  openAtLogin: boolean;
}

export interface LoginItemHost {
  get(): LoginItem;
  set(item: LoginItem): void;
}

/**
 * Decides whether the operating system needs telling. Returns null when it already agrees, so a
 * launch does not rewrite a registry key on every start.
 */
export function loginItemChange(wanted: boolean, current: LoginItem): LoginItem | null {
  return current.openAtLogin === wanted ? null : { openAtLogin: wanted };
}

const electronHost: LoginItemHost = {
  get: () => ({ openAtLogin: app.getLoginItemSettings().openAtLogin }),
  set: (item) => app.setLoginItemSettings({ openAtLogin: item.openAtLogin })
};

/** Applies the stored preference. A dev build never registers itself: it would launch the unpackaged
 *  binary at login, which is not something anyone asked for. */
export function applyStartWithWindows(wanted: boolean, host: LoginItemHost = electronHost): boolean {
  if (process.platform !== 'win32' || !app.isPackaged || runtimeProfile.profile !== 'live') return false;
  const change = loginItemChange(wanted, host.get());
  if (change === null) return false;
  host.set(change);
  return true;
}
