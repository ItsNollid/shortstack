import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../../shared/updates';
import { UpdateService, type AutoUpdater } from './updateService';

const dirs: string[] = [];
const notARepo = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortstack-upd-'));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Stands in for electron-updater: records what was asked of it, and can fire its events. */
function fakeUpdater(): AutoUpdater & { fire(event: string, payload?: unknown): void; calls: string[] } {
  const listeners = new Map<string, (payload: never) => void>();
  const calls: string[] = [];
  return {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    calls,
    checkForUpdates: async () => {
      calls.push('check');
      return null;
    },
    downloadUpdate: async () => {
      calls.push('download');
      return null;
    },
    quitAndInstall: () => calls.push('install'),
    on(event: string, listener: (...args: never[]) => void) {
      listeners.set(event, listener as (payload: never) => void);
      return this;
    },
    fire(event: string, payload?: unknown) {
      listeners.get(event)?.(payload as never);
    }
  };
}

const service = (updater?: AutoUpdater, onChange?: (status: UpdateStatus) => void): UpdateService =>
  new UpdateService({
    channel: updater === undefined ? 'development' : 'release',
    buildCommit: 'd44a4ec',
    dev: { projectDir: notARepo(), git: async () => '' },
    updater,
    onChange,
    now: () => new Date('2026-09-13T12:00:00.000Z')
  });

describe('what it insists on from electron-updater', () => {
  // Both defaults are true, and both are wrong here: nothing downloads or installs unasked.
  it('turns off automatic downloading and installing on quit', () => {
    const updater = fakeUpdater();
    service(updater);
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });
});

describe('states', () => {
  it('follows the updater from checking through to ready', async () => {
    const updater = fakeUpdater();
    const seen: string[] = [];
    const subject = service(updater, (status) => seen.push(status.state.kind));

    await subject.check();
    updater.fire('checking-for-update');
    updater.fire('update-available', { version: '1.2.0', releaseNotes: 'Notes' });
    expect(subject.status().state).toEqual({ kind: 'available', version: '1.2.0', notes: 'Notes' });

    await subject.download();
    updater.fire('download-progress', { percent: 42 });
    expect(subject.status().state).toEqual({ kind: 'downloading', version: '1.2.0', percent: 42 });

    updater.fire('update-downloaded', { version: '1.2.0' });
    expect(subject.status().state).toEqual({ kind: 'ready', version: '1.2.0' });
    expect(seen).toContain('checking');
  });

  it('reports being up to date with the time it looked', async () => {
    const updater = fakeUpdater();
    const subject = service(updater);
    updater.fire('update-not-available', {});
    expect(subject.status().state).toEqual({ kind: 'current', checkedAt: '2026-09-13T12:00:00.000Z' });
  });

  // A friend with no signal must get a working app, not a crash and not a dialog.
  it('turns an unreachable update server into a state, not an exception', async () => {
    const updater = fakeUpdater();
    updater.checkForUpdates = async () => {
      throw new Error('getaddrinfo ENOTFOUND github.com');
    };
    const subject = service(updater);

    await expect(subject.check()).resolves.toMatchObject({ state: { kind: 'failed' } });
    expect(subject.status().state).toMatchObject({ reason: expect.stringContaining('ENOTFOUND') });
  });

  it('survives an updater that reports an error event', () => {
    const updater = fakeUpdater();
    const subject = service(updater);
    updater.fire('error', new Error('boom'));
    expect(subject.status().state).toMatchObject({ kind: 'failed', reason: expect.stringContaining('boom') });
  });

  it('copes with events that carry nothing useful', () => {
    const updater = fakeUpdater();
    const subject = service(updater);
    updater.fire('update-available', {});
    expect(subject.status().state).toMatchObject({ kind: 'available', version: 'unknown', notes: null });
  });
});

describe('acting on an update', () => {
  it('downloads only when there is something to download', async () => {
    const updater = fakeUpdater();
    const subject = service(updater);

    await expect(subject.download()).resolves.toMatchObject({ ok: false });
    expect(updater.calls).not.toContain('download');

    updater.fire('update-available', { version: '1.2.0' });
    await expect(subject.download()).resolves.toEqual({ ok: true });
    expect(updater.calls).toContain('download');
  });

  it('installs only once something is downloaded', () => {
    const updater = fakeUpdater();
    const subject = service(updater);

    expect(subject.install()).toMatchObject({ ok: false });
    expect(updater.calls).not.toContain('install');

    updater.fire('update-downloaded', { version: '1.2.0' });
    expect(subject.install()).toEqual({ ok: true });
    expect(updater.calls).toContain('install');
  });

  // The development channel has no downloads at all; its update is a rebuild from source.
  it('refuses downloads and installs in development, and says why', async () => {
    const subject = service();
    await expect(subject.download()).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('rebuilding') });
    expect(subject.install()).toMatchObject({ ok: false, reason: expect.stringContaining('rebuilding') });
  });

  it('reports a missing build script rather than claiming a rebuild started', () => {
    expect(service().rebuild()).toMatchObject({ ok: false, reason: expect.stringContaining('not next to') });
  });
});

describe('checking without an updater', () => {
  it('still answers, so development builds have a status like any other', async () => {
    const subject = service();
    await expect(subject.check()).resolves.toMatchObject({ channel: 'development', state: { kind: 'idle' } });
  });
});
