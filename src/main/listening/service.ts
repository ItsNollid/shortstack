// Listening, from the app's side: what is installed, downloading what the person asks for one thing at a time,
// and listening to a video once so drafting can use what was said.
import type Database from 'better-sqlite3';
import * as path from 'path';
import {
  ENGINES,
  findModel,
  recommendListening,
  resolveListening,
  type EngineKind,
  type ListeningStatus,
  type MachineFacts,
  type ModelDownload,
  type ResolvedListening
} from '../../shared/listening';
import { transcriptText } from '../../shared/transcript';
import { getQueueItem } from '../db/queueRepo';
import { readSettings } from '../db/settingsRepo';
import { readTranscript, saveTranscript, type StoredTranscript } from '../db/transcriptRepo';
import { findTools as defaultFindTools, type Tools } from '../media/renderRunner';
import { installEngine, installModel, modelPath, readInstalled, removeEngine, removeModel, type InstallResult } from './install';
import { machineFacts } from './machine';
import { transcribeFile } from './transcribe';

export interface ListeningServiceOptions {
  db: Database.Database;
  /** The listening folder under the app's data. */
  root: string;
  findTools?: () => Promise<Tools | null>;
  machine?: () => Promise<MachineFacts & { cards: string[] }>;
  installEngine?: typeof installEngine;
  installModel?: typeof installModel;
  transcribe?: typeof transcribeFile;
  onChange?(): void;
  now?: () => Date;
}

export type DownloadRequest = { engine: EngineKind } | { model: string };

type Heard = { ok: true; transcript: StoredTranscript | null } | { ok: false; reason: string };

/** Progress is reported this often at most: a large download would otherwise flood the screen with updates. */
const PROGRESS_EVERY_MS = 250;

export class ListeningService {
  private readonly options: ListeningServiceOptions;
  private machine: Promise<MachineFacts & { cards: string[] }> | null = null;
  private downloading: ListeningStatus['downloading'] = null;
  private controller: AbortController | null = null;
  private problem: string | null = null;
  private lastBackend: ListeningStatus['lastBackend'] = null;
  private queue: Promise<unknown> = Promise.resolve();
  private download: Promise<void> = Promise.resolve();
  private lastProgressAt = 0;

  constructor(options: ListeningServiceOptions) {
    this.options = options;
  }

  private facts(): Promise<MachineFacts & { cards: string[] }> {
    this.machine ??= (this.options.machine ?? machineFacts)();
    return this.machine;
  }

  private async ready(): Promise<{ ok: true; value: ResolvedListening; cliPath: string; modelPath: string } | { ok: false; reason: string }> {
    const { settings } = readSettings(this.options.db);
    const installed = await readInstalled(this.options.root);
    const choice = resolveListening({
      engine: settings.listen_engine,
      installedEngines: Object.keys(installed.engines) as EngineKind[],
      modelId: settings.listen_model,
      modelFile: settings.listen_model_file,
      installedModels: installed.models
    });
    if (!choice.ok) return choice;
    const engine = installed.engines[choice.value.engine];
    if (engine === undefined) return { ok: false, reason: 'Download a listening engine first' };
    const file = choice.value.modelFile ?? modelPath(this.options.root, findModel(choice.value.modelId ?? '') as ModelDownload);
    return { ok: true, value: choice.value, cliPath: engine.cliPath, modelPath: file };
  }

  async status(): Promise<ListeningStatus> {
    const [facts, installed, ready] = await Promise.all([this.facts(), readInstalled(this.options.root), this.ready()]);
    const recommendation = recommendListening(facts);
    return {
      machine: { hasNvidia: facts.hasNvidia, cards: facts.cards, memoryBytes: facts.memoryBytes },
      recommended: { engine: recommendation.engine, modelId: recommendation.model.id },
      engines: Object.keys(installed.engines) as EngineKind[],
      models: installed.models,
      downloading: this.downloading,
      problem: this.problem,
      lastBackend: this.lastBackend,
      resolved: ready.ok ? ready.value : null,
      notReady: ready.ok ? null : ready.reason
    };
  }

  /** Starts a download and returns straight away. Progress and the outcome arrive through onChange and status(). */
  start(request: DownloadRequest): { ok: true } | { ok: false; reason: string } {
    if (this.downloading !== null) return { ok: false, reason: 'Another download is still going' };
    const engine = 'engine' in request ? request.engine : null;
    const model = 'model' in request ? findModel(request.model) : undefined;
    if (engine === null && model === undefined) return { ok: false, reason: 'That is not one of the models ShortStack offers' };

    const controller = new AbortController();
    this.controller = controller;
    this.problem = null;
    this.downloading = {
      engine,
      modelId: model?.id ?? null,
      label: engine !== null ? `${ENGINES[engine].label} engine` : `${(model as ModelDownload).label} model`,
      received: 0,
      total: engine !== null ? ENGINES[engine].bytes : (model as ModelDownload).bytes
    };
    this.changed();

    const deps = {
      root: this.options.root,
      signal: controller.signal,
      onProgress: (received: number) => {
        if (this.downloading === null) return;
        this.downloading = { ...this.downloading, received };
        const now = Date.now();
        if (now - this.lastProgressAt >= PROGRESS_EVERY_MS) {
          this.lastProgressAt = now;
          this.changed();
        }
      }
    };
    const run: Promise<InstallResult<unknown>> =
      engine !== null
        ? (this.options.installEngine ?? installEngine)(deps, engine)
        : (this.options.installModel ?? installModel)(deps, (model as ModelDownload).id);

    this.download = run
      .then(
        (result) => {
          if (!result.ok && result.cancelled !== true) this.problem = result.reason;
        },
        (error: unknown) => {
          this.problem = error instanceof Error ? error.message : String(error);
        }
      )
      .finally(() => {
        this.downloading = null;
        this.controller = null;
        this.changed();
      });
    return { ok: true };
  }

  /** Resolves when the current download, if any, has finished one way or another. */
  settled(): Promise<void> {
    return this.download;
  }

  cancel(): void {
    this.controller?.abort();
  }

  async remove(request: DownloadRequest): Promise<void> {
    if ('engine' in request) await removeEngine(this.options.root, request.engine);
    else await removeModel(this.options.root, request.model);
    this.changed();
  }

  /** What was said in a video: kept from before, or listened to now when asked. One video at a time. */
  transcriptFor(queueId: number, listenIfMissing: boolean): Promise<Heard> {
    const next = this.queue.then(() => this.hear(queueId, listenIfMissing));
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** For drafting: the words, or nothing when there is nothing to use. */
  async speechFor(queueId: number): Promise<string | null> {
    const heard = await this.transcriptFor(queueId, true);
    return heard.ok && heard.transcript !== null && heard.transcript.segments.length > 0 ? transcriptText(heard.transcript.segments) : null;
  }

  private async hear(queueId: number, listenIfMissing: boolean): Promise<Heard> {
    const { db } = this.options;
    const item = getQueueItem(db, queueId);
    if (item === undefined) return { ok: false, reason: 'That video is no longer in the queue' };
    const stored = readTranscript(db, item.video_id);
    if (stored !== null || !listenIfMissing) return { ok: true, transcript: stored };
    if (item.missing) return { ok: false, reason: 'The video file is not where it was' };

    const ready = await this.ready();
    if (!ready.ok) return ready;
    const tools = await (this.options.findTools ?? defaultFindTools)();
    if (tools === null) return { ok: false, reason: 'Listening needs ffmpeg, and it is not installed anywhere ShortStack can find it' };

    const result = await (this.options.transcribe ?? transcribeFile)(
      { tools, cliPath: ready.cliPath, modelPath: ready.modelPath, englishOnly: ready.value.englishOnly, workDir: path.join(this.options.root, 'work') },
      item.filepath
    );
    if (!result.ok) return result;

    const transcript: StoredTranscript = {
      model: ready.value.modelId ?? ready.value.label,
      backend: result.backend,
      madeAt: (this.options.now?.() ?? new Date()).toISOString(),
      segments: result.segments
    };
    saveTranscript(db, item.video_id, transcript);
    this.lastBackend = result.backend;
    this.changed();
    return { ok: true, transcript };
  }

  private changed(): void {
    this.options.onChange?.();
  }
}
