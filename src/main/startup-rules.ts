// Pure part of the "start with Windows" setting: no Electron import, so it can be tested in plain
// Node. Same split as profile-rules/profile.
export interface LoginItem {
  openAtLogin: boolean;
}

/**
 * Decides whether the operating system needs telling. Returns null when it already agrees, so a
 * launch does not rewrite a registry key every time it starts.
 */
export function loginItemChange(wanted: boolean, current: LoginItem): LoginItem | null {
  return current.openAtLogin === wanted ? null : { openAtLogin: wanted };
}

export interface StartupContext {
  platform: string;
  isPackaged: boolean;
  profile: 'dev' | 'live';
}

/** A dev build never registers itself: that would launch an unpackaged binary at login. */
export function shouldManageLoginItem(context: StartupContext): boolean {
  return context.platform === 'win32' && context.isPackaged && context.profile === 'live';
}
