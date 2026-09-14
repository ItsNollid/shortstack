// Drafts details for videos nobody has written details for yet, quietly, in the background.
//
// It is deliberately slow and small. A local model takes seconds per video and competes with
// whatever else the machine is doing, including the video the user is watching in the app, so this
// takes a few at a time and stops the moment Ollama stops answering.
import type Database from 'better-sqlite3';
import { pickForDraft } from '../../shared/autoDraft';
import { applyDraft, listQueueItems } from '../db/queueRepo';
import { readSettings } from '../db/settingsRepo';
import { draftFor, type DraftDeps } from './draft';
import type { MetadataSuggestion } from './metadataSuggestion';
import type { AiResult } from './ollamaClient';

/** Enough to make progress on a folder of 200, few enough that a tick is never a long stall. */
const PER_TICK = 3;
const DEFAULT_TICK_MS = 60_000;

export interface DraftWorkerOptions {
  db: Database.Database;
  draftDeps: DraftDeps;
  now?: () => Date;
  tickMs?: number;
  onChange?(): void;
  /** Overridden in tests, so the worker's rules can be exercised without a model installed. */
  draft?: (deps: DraftDeps, queueId: number) => Promise<AiResult<MetadataSuggestion>>;
}

export class DraftWorker {
  private readonly db: Database.Database;
  private readonly draftDeps: DraftDeps;
  private readonly now: () => Date;
  private readonly tickMs: number;
  private readonly onChange?: () => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly draft: (deps: DraftDeps, queueId: number) => Promise<AiResult<MetadataSuggestion>>;

  constructor(options: DraftWorkerOptions) {
    this.db = options.db;
    this.draftDeps = options.draftDeps;
    this.now = options.now ?? (() => new Date());
    this.tickMs = options.tickMs ?? DEFAULT_TICK_MS;
    this.onChange = options.onChange;
    this.draft = options.draft ?? draftFor;
  }

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

  /** Called when the queue changes, so a freshly scanned folder does not wait out the tick. */
  kick(): void {
    void this.runTick();
  }

  /** Returns how many videos it wrote details for, which is what the tests assert on. */
  async runTick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const { settings } = readSettings(this.db);
      const due = pickForDraft(listQueueItems(this.db), settings.ai_auto_draft, PER_TICK);

      let drafted = 0;
      for (const item of due) {
        const suggestion = await this.draft(this.draftDeps, item.id);
        if (!suggestion.ok) {
          // Ollama being off is the normal case, not an error worth logging every minute. Stopping
          // the whole tick matters: without it this would fail once per video, every tick, forever.
          return drafted;
        }
        // Only the details the person chose. The model answered for all three in one request, so
        // choosing fewer costs nothing — it only writes less. Read again here rather than at the start
        // of the tick, because the request took seconds and the choice may have changed meanwhile.
        const { settings: current } = readSettings(this.db);
        const chosen = new Set(current.ai_auto_draft_fields);
        const written = applyDraft(
          this.db,
          item.id,
          {
            ...(chosen.has('title') ? { title: suggestion.value.title, titleAngle: suggestion.value.titleAngle ?? null } : {}),
            ...(chosen.has('description') ? { description: suggestion.value.description } : {}),
            ...(chosen.has('tags') ? { tags: suggestion.value.tags } : {})
          },
          { now: this.now(), uploadMethod: current.upload_method }
        );
        if (written.ok) drafted += 1;
      }

      if (drafted > 0) this.onChange?.();
      return drafted;
    } finally {
      this.running = false;
    }
  }
}
