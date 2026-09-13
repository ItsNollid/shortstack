// The release channel: electron-updater against GitHub Releases, for the people this gets sent to.
//
// Two deliberate choices. Nothing downloads without being asked — an app that quietly pulls a
// hundred megabytes on someone's phone tether is not being helpful, and the YouTube API Services
// policies are emphatic that the user stays in control. And nothing here is ever fatal: a friend on
// a train with no signal gets an app that works, not a dialog about GitHub.
import type { UpdateChannel, UpdateState, UpdateStatus } from '../../shared/updates';
import { sourceState, startRebuild, type DevUpdateDeps } from './devUpdates';

/** The slice of electron-updater's autoUpdater this uses, so tests need no network and no Electron. */
export interface AutoUpdater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: string, listener: (...args: never[]) => void): unknown;
}

export interface UpdateServiceOptions {
  channel: UpdateChannel;
  buildCommit: string;
  dev: DevUpdateDeps;
  /** Absent in development, and in a release build with no publish target configured yet. */
  updater?: AutoUpdater;
  /** What to say when there is no updater. Without it, a release build would claim to rebuild from
   *  source, which is meaningless on a machine that only ever had the installer. */
  withoutUpdater?: string;
  onChange?(status: UpdateStatus): void;
  now?(): Date;
}

export class UpdateService {
  private readonly options: UpdateServiceOptions;
  private readonly now: () => Date;
  private state: UpdateState = { kind: 'idle' };
  private commitsBehind: number | undefined;
  private sourceCommit: string | undefined;

  constructor(options: UpdateServiceOptions) {
    this.options = options;
    this.now = options.now ?? (() => new Date());

    const updater = options.updater;
    if (updater === undefined) return;

    updater.autoDownload = false;
    // The install happens when the user says so, not silently behind a quit they meant as a quit.
    updater.autoInstallOnAppQuit = false;

    updater.on('checking-for-update', () => this.set({ kind: 'checking' }));
    updater.on('update-available', ((info: { version?: string; releaseNotes?: unknown }) => {
      this.set({
        kind: 'available',
        version: typeof info?.version === 'string' ? info.version : 'unknown',
        notes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : null
      });
    }) as never);
    updater.on('update-not-available', () => this.set({ kind: 'current', checkedAt: this.now().toISOString() }));
    updater.on('download-progress', ((progress: { percent?: number }) => {
      const version = this.state.kind === 'downloading' || this.state.kind === 'available' ? this.state.version : 'unknown';
      this.set({ kind: 'downloading', version, percent: typeof progress?.percent === 'number' ? progress.percent : 0 });
    }) as never);
    updater.on('update-downloaded', ((info: { version?: string }) => {
      this.set({ kind: 'ready', version: typeof info?.version === 'string' ? info.version : 'unknown' });
    }) as never);
    updater.on('error', ((error: Error) => {
      this.set({ kind: 'failed', reason: `Could not check for updates: ${error?.message ?? 'unknown error'}` });
    }) as never);
  }

  status(): UpdateStatus {
    return {
      channel: this.options.channel,
      state: this.state,
      ...(this.commitsBehind === undefined ? {} : { commitsBehind: this.commitsBehind }),
      ...(this.sourceCommit === undefined ? {} : { sourceCommit: this.sourceCommit })
    };
  }

  /** Both channels at once: the source comparison costs nothing and answers nothing on a friend's PC. */
  async check(): Promise<UpdateStatus> {
    const source = await sourceState(this.options.dev, this.options.buildCommit);
    this.commitsBehind = source?.commitsBehind;
    this.sourceCommit = source?.headCommit;

    const updater = this.options.updater;
    if (updater !== undefined) {
      try {
        await updater.checkForUpdates();
      } catch (error) {
        this.set({ kind: 'failed', reason: `Could not reach the update server: ${(error as Error)?.message ?? 'unknown'}` });
      }
    }
    this.options.onChange?.(this.status());
    return this.status();
  }

  /** Asked for by the user, never started on its own. */
  async download(): Promise<{ ok: boolean; reason?: string }> {
    const updater = this.options.updater;
    if (updater === undefined) return { ok: false, reason: this.noUpdater() };
    if (this.state.kind !== 'available') return { ok: false, reason: 'There is nothing to download' };

    try {
      this.set({ kind: 'downloading', version: this.state.version, percent: 0 });
      await updater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      this.set({ kind: 'failed', reason: `The download did not finish: ${(error as Error)?.message ?? 'unknown'}` });
      return { ok: false, reason: 'The download did not finish' };
    }
  }

  install(): { ok: boolean; reason?: string } {
    const updater = this.options.updater;
    if (updater === undefined) return { ok: false, reason: this.noUpdater() };
    if (this.state.kind !== 'ready') return { ok: false, reason: 'No update has been downloaded yet' };

    updater.quitAndInstall(false, true);
    return { ok: true };
  }

  /** The development equivalent of installing: hand it to the batch file and let it take over. */
  rebuild(): { ok: boolean; reason?: string } {
    return startRebuild(this.options.dev.projectDir)
      ? { ok: true }
      : { ok: false, reason: 'The build script is not next to this copy of ShortStack' };
  }

  private noUpdater(): string {
    return this.options.withoutUpdater ?? 'This build updates by rebuilding from source';
  }

  private set(state: UpdateState): void {
    this.state = state;
    this.options.onChange?.(this.status());
  }
}
