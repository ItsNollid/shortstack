// "Start with Windows" was a switch that stored a value and changed nothing. This is the part that
// makes it true; the decisions live in startup-rules.ts so they can be tested without Electron.
import { app } from 'electron';
import { runtimeProfile } from './bootstrap/profile';
import { loginItemChange, shouldManageLoginItem, type LoginItem } from './startup-rules';

export interface LoginItemHost {
  get(): LoginItem;
  set(item: LoginItem): void;
}

const electronHost: LoginItemHost = {
  get: () => ({ openAtLogin: app.getLoginItemSettings().openAtLogin }),
  set: (item) => app.setLoginItemSettings({ openAtLogin: item.openAtLogin })
};

/** Applies the stored preference. Returns true when the system was actually changed. */
export function applyStartWithWindows(wanted: boolean, host: LoginItemHost = electronHost): boolean {
  const manage = shouldManageLoginItem({
    platform: process.platform,
    isPackaged: app.isPackaged,
    profile: runtimeProfile.profile
  });
  if (!manage) return false;

  const change = loginItemChange(wanted, host.get());
  if (change === null) return false;
  host.set(change);
  return true;
}
