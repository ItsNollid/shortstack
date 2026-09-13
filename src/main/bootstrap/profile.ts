// Must be the first import in src/main/index.ts: it redirects userData before any other
// module (e.g. youtube/auth.ts) resolves app.getPath('userData') at import time.
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { resolveProfile, type ProfileDecision } from './profile-rules';

function readBakedBuildProfile(): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf-8'));
    return typeof pkg.shortstackBuildProfile === 'string' ? pkg.shortstackBuildProfile : undefined;
  } catch {
    return undefined;
  }
}

const decision = resolveProfile({
  env: process.env,
  isPackaged: app.isPackaged,
  bakedBuildProfile: readBakedBuildProfile()
});

// An end-to-end test needs its own profile directory, or it would work against whatever is in the
// developer's. Only ever read from the environment of whoever launched the app, and only honoured
// for a dev profile, so it cannot be used to redirect a live one.
const override = process.env.SHORTSTACK_USER_DATA;
const userDataDir =
  override !== undefined && override !== '' && decision.profile === 'dev'
    ? override
    : path.join(app.getPath('appData'), decision.userDataFolder);
app.setPath('userData', userDataDir);

console.info(`[ShortStack] profile=${decision.profile} uploads=${decision.uploads} userData=${userDataDir} (${decision.reason})`);

export const runtimeProfile: Readonly<ProfileDecision & { userDataDir: string }> = Object.freeze({
  ...decision,
  userDataDir
});
