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

const userDataDir = path.join(app.getPath('appData'), decision.userDataFolder);
app.setPath('userData', userDataDir);

console.info(`[ShortStack] profile=${decision.profile} uploads=${decision.uploads} userData=${userDataDir} (${decision.reason})`);

export const runtimeProfile: Readonly<ProfileDecision & { userDataDir: string }> = Object.freeze({
  ...decision,
  userDataDir
});
