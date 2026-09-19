// Keeping the promise the privacy policy makes about channel details: confirmed with YouTube while ShortStack is
// connected, gone the moment access is taken away, and gone if a month passes with no confirmation. Run at
// startup and twice a day.
import type Database from 'better-sqlite3';
import type { UploadMethod } from '../../shared/queue';
import { retentionVerdict, type RefreshOutcome, type RetentionVerdict } from '../../shared/retention';
import { readActiveChannel, upsertChannel } from '../db/channelRepo';
import type { AuthState } from './authService';
import { forgetChannelData } from './channelData';
import type { YouTubeGateway } from './gateway';

export interface RetentionDeps {
  db: Database.Database;
  gateway: Pick<YouTubeGateway, 'fetchChannelProfile'>;
  authState(): AuthState;
  appIcon: { refresh(avatarUrl: string | null): Promise<boolean>; clear(): Promise<void> };
  analytics: { clear(): void };
  thumbnailDir: string;
  uploadMethod(): UploadMethod;
  now?(): Date;
  /** Told when something was deleted, so the screen stops showing a channel that is no longer held. */
  onForgotten?(): void;
}

export interface RetentionResult {
  outcome: RefreshOutcome;
  verdict: RetentionVerdict;
}

export async function checkChannelRetention(deps: RetentionDeps): Promise<RetentionResult> {
  const now = deps.now?.() ?? new Date();
  const channel = readActiveChannel(deps.db);
  const outcome = channel === null ? 'nothing_stored' : await confirmChannel(deps, now);
  const verdict = retentionVerdict({ outcome, lastRefreshedAt: channel?.updatedAt ?? null, now });

  if (verdict.forget) {
    await forgetChannelData(
      {
        db: deps.db,
        thumbnailDir: deps.thumbnailDir,
        appIcon: deps.appIcon,
        analytics: deps.analytics,
        now,
        uploadMethod: deps.uploadMethod()
      },
      verdict.because
    );
    deps.onForgotten?.();
  }
  return { outcome, verdict };
}

/** Asks YouTube who this channel is, and says what came of asking. A success is itself the refresh. */
async function confirmChannel(deps: RetentionDeps, now: Date): Promise<RefreshOutcome> {
  // No usable grant is an answer on its own, and costs no call.
  const before = deps.authState();
  if (before === 'expired' || before === 'disconnected') return 'access_gone';

  const profile = await deps.gateway.fetchChannelProfile();
  if (profile.ok) {
    upsertChannel(
      deps.db,
      {
        id: profile.value.id,
        title: profile.value.title,
        handle: profile.value.handle,
        avatarUrl: profile.value.avatarUrl,
        subscriberCount: profile.value.subscriberCount,
        uploadsPlaylistId: profile.value.uploadsPlaylistId
      },
      now
    );
    await deps.appIcon.refresh(profile.value.avatarUrl);
    return 'refreshed';
  }

  // Being offline is not permission being taken away, and must never be treated as it.
  const after = deps.authState();
  return after === 'expired' || after === 'disconnected' ? 'access_gone' : 'unreachable';
}
