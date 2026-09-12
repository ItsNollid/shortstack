// Runs the scheduler: reads state, asks decide() what to do, and performs it.
// Local state changes go straight through the repository; anything touching YouTube is an
// injected effect, so the engine is testable without network, Electron or timers.
import type Database from 'better-sqlite3';
import type { UploadMethod } from '../../shared/queue';
import { applyQueueEvent, countQueueByState, listQueueItems } from '../db/queueRepo';
import { createPosting, listVideoRotation, rotationVerdict } from '../db/rotationRepo';
import { readSettings, writeSetting } from '../db/settingsRepo';
import { decide, type SchedulerAction, type SchedulerHolds } from './decide';

export type EffectOutcome = { ok: true } | { ok: false; hold?: { kind: 'api' | 'upload_quota'; until: string } };

export interface SchedulerEffects {
  authState(): SchedulerHolds['auth'];
  startUpload(itemId: number): Promise<EffectOutcome>;
  syncRemote(itemId: number): Promise<EffectOutcome>;
  verifyRemote(itemId: number): Promise<EffectOutcome>;
  detectManualUploads(itemIds: readonly number[]): Promise<EffectOutcome>;
  onChange?(): void;
}

export interface EngineOptions {
  db: Database.Database;
  effects: SchedulerEffects;
  now?: () => Date;
  tickMs?: number;
}

export interface SchedulerStatus {
  paused: boolean;
  uploadInFlight: boolean;
  apiBackoffUntil: string | null;
  uploadQuotaUntil: string | null;
  auth: SchedulerHolds['auth'];
  nextPublishAt: string | null;
  counts: Record<string, number>;
}

const DEFAULT_TICK_MS = 30_000;
/** Rotation is not urgent: a few a tick keeps a large library from flooding the queue at once. */
const MAX_ROTATIONS_PER_TICK = 5;

const REMOTE_ERROR_RETRY_MS = 5 * 60_000;

export class SchedulerEngine {
  private readonly db: Database.Database;
  private readonly effects: SchedulerEffects;
  private readonly now: () => Date;
  private readonly tickMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private uploadInFlight = false;
  private apiBackoffUntil: string | null = null;
  private uploadQuotaUntil: string | null = null;
  private lastRemoteErrorRetry = 0;

  constructor(options: EngineOptions) {
    this.db = options.db;
    this.effects = options.effects;
    this.now = options.now ?? (() => new Date());
    this.tickMs = options.tickMs ?? DEFAULT_TICK_MS;
  }

  /** Starts ticking. The persisted pause is respected: starting never silently resumes uploads. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.runTick(), this.tickMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    void this.runTick();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  isPaused(): boolean {
    return readSettings(this.db).settings.scheduler_paused;
  }

  pause(): void {
    writeSetting(this.db, 'scheduler_paused', true);
    this.effects.onChange?.();
  }

  resume(): void {
    writeSetting(this.db, 'scheduler_paused', false);
    this.effects.onChange?.();
    void this.runTick();
  }

  /** Runs a tick right away, used after a user action instead of waiting for the timer. */
  kick(): Promise<SchedulerAction[]> {
    return this.runTick();
  }

  async runTick(): Promise<SchedulerAction[]> {
    if (this.ticking) return [];
    this.ticking = true;
    try {
      return await this.tick();
    } catch (error) {
      console.error('[ShortStack] scheduler tick failed', error);
      return [];
    } finally {
      this.ticking = false;
    }
  }

  status(): SchedulerStatus {
    const items = listQueueItems(this.db);
    const upcoming = items
      .filter((item) => item.scheduled_for !== null && item.state !== 'published' && item.state !== 'rejected')
      .map((item) => item.scheduled_for as string)
      .sort();
    return {
      paused: this.isPaused(),
      uploadInFlight: this.uploadInFlight,
      apiBackoffUntil: this.apiBackoffUntil,
      uploadQuotaUntil: this.uploadQuotaUntil,
      auth: this.effects.authState(),
      nextPublishAt: upcoming[0] ?? null,
      counts: countQueueByState(this.db) as Record<string, number>
    };
  }

  private async tick(): Promise<SchedulerAction[]> {
    const now = this.now();
    const { settings } = readSettings(this.db);
    const retryRemoteErrors = now.getTime() - this.lastRemoteErrorRetry >= REMOTE_ERROR_RETRY_MS;

    const actions = decide({
      now,
      items: listQueueItems(this.db),
      settings: {
        uploadMethod: settings.upload_method,
        uploadTimes: settings.upload_times,
        rotationUploadTimes: settings.rotation_upload_times,
        autoScheduleDays: settings.auto_schedule_days,
        paused: settings.scheduler_paused
      },
      holds: {
        auth: this.effects.authState(),
        apiBackoffUntil: this.apiBackoffUntil,
        uploadQuotaUntil: this.uploadQuotaUntil,
        uploadInFlight: this.uploadInFlight,
        retryRemoteErrors
      }
    });

    if (retryRemoteErrors) this.lastRemoteErrorRetry = now.getTime();
    for (const action of actions) await this.perform(action, now, settings.upload_method);

    const rotated = settings.scheduler_paused ? 0 : this.queueRotations(settings, now);
    if (actions.length > 0 || rotated > 0) this.effects.onChange?.();
    return actions;
  }

  /**
   * Queues the next posting of any video that is due another one. Kept out of decide() because it
   * works per video rather than per posting, and its answer depends on the whole history of a file
   * rather than the state of one queue row.
   */
  private queueRotations(settings: { rotation_max_postings: number; rotation_min_gap_days: number; notify_subscribers: boolean }, now: Date): number {
    if (settings.rotation_max_postings <= 0) return 0;

    let created = 0;
    for (const rotation of listVideoRotation(this.db)) {
      const verdict = rotationVerdict(rotation, settings.rotation_max_postings, settings.rotation_min_gap_days, now);
      if (!verdict.rotate) continue;
      const result = createPosting(
        this.db,
        rotation.videoId,
        {
          notifyOnNew: settings.notify_subscribers,
          maxPostings: settings.rotation_max_postings,
          minGapDays: settings.rotation_min_gap_days
        },
        now
      );
      if (result.ok) created += 1;
      // A re-run arrives as pending like anything else, so nothing goes out without approval.
      if (created >= MAX_ROTATIONS_PER_TICK) break;
    }
    return created;
  }

  private async perform(action: SchedulerAction, now: Date, uploadMethod: UploadMethod): Promise<void> {
    const ctx = { now, uploadMethod };
    switch (action.type) {
      case 'missed_slot':
        applyQueueEvent(this.db, action.id, { type: 'missed_slot' }, ctx);
        return;
      case 'auto_slot':
        applyQueueEvent(this.db, action.id, { type: 'auto_slot', at: action.at }, ctx);
        return;
      case 'begin_manual_upload':
        applyQueueEvent(this.db, action.id, { type: 'begin_manual_upload' }, ctx);
        return;
      case 'start_upload':
        // Detached on purpose: an upload runs for minutes, and the rest of the schedule
        // (missed slots, remote sync) must keep working while it does.
        this.uploadInFlight = true;
        void this.effects
          .startUpload(action.id)
          .then((outcome) => this.applyOutcome(outcome))
          .catch((error: unknown) => console.error('[ShortStack] upload failed', error))
          .finally(() => {
            this.uploadInFlight = false;
            this.effects.onChange?.();
          });
        return;
      case 'sync_remote':
        this.applyOutcome(await this.effects.syncRemote(action.id));
        return;
      case 'verify_remote':
        this.applyOutcome(await this.effects.verifyRemote(action.id));
        return;
      case 'detect_manual_uploads':
        this.applyOutcome(await this.effects.detectManualUploads(action.ids));
        return;
    }
  }

  private applyOutcome(outcome: EffectOutcome): void {
    if (outcome.ok || outcome.hold === undefined) return;
    if (outcome.hold.kind === 'api') this.apiBackoffUntil = outcome.hold.until;
    else this.uploadQuotaUntil = outcome.hold.until;
  }
}
