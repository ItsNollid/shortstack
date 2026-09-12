// Pure profile resolution: no Electron imports, so it can be unit-tested in plain Node.

export type ProfileName = 'dev' | 'live';
export type UploadMode = 'dry-run' | 'live';

export interface ProfileDecision {
  profile: ProfileName;
  uploads: UploadMode;
  /** Folder name under %APPDATA% used as Electron's userData directory. */
  userDataFolder: string;
  reason: string;
}

export interface ProfileInputs {
  env: Record<string, string | undefined>;
  isPackaged: boolean;
  /** Set via electron-builder extraMetadata for packaged test builds. */
  bakedBuildProfile?: string;
}

export const LIVE_FOLDER = 'shortstack';
export const DEV_FOLDER = 'shortstack-dev';

export function resolveProfile({ env, isPackaged, bakedBuildProfile }: ProfileInputs): ProfileDecision {
  const dev = (reason: string): ProfileDecision => ({ profile: 'dev', uploads: 'dry-run', userDataFolder: DEV_FOLDER, reason });
  const live = (reason: string): ProfileDecision => ({ profile: 'live', uploads: 'live', userDataFolder: LIVE_FOLDER, reason });

  if (bakedBuildProfile === 'dev') return dev('packaged as a dev/test build');
  if (isPackaged) return live('packaged release build');

  const wantsLiveProfile = env.SHORTSTACK_PROFILE === 'live';
  const wantsLiveUploads = env.SHORTSTACK_UPLOAD_MODE === 'live';

  if (wantsLiveProfile && wantsLiveUploads) {
    return live('SHORTSTACK_PROFILE=live and SHORTSTACK_UPLOAD_MODE=live');
  }
  if (wantsLiveProfile || wantsLiveUploads) {
    return dev('only one of SHORTSTACK_PROFILE / SHORTSTACK_UPLOAD_MODE is "live"; both are required');
  }
  return dev('unpackaged runs default to the dev profile');
}
