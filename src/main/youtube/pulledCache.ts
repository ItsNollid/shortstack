// The last answer to each Analytics question, kept while the app runs.
//
// Opening Analytics used to ask YouTube for everything again, and asking the model for advice asked a
// second time for numbers already on screen. Kept here, the page shows the last pull at once and asks
// again only as the refresh setting allows. Nothing is written to disk: it is the channel's data, and
// it goes when the app closes or the channel is disconnected.
import { freshEnough, type MaxAge, type Pulled } from '../../shared/analyticsRefresh';
import type { GatewayResult } from './gateway';

export class PulledCache {
  private readonly kept = new Map<string, Pulled<unknown>>();
  private readonly running = new Map<string, Promise<GatewayResult<Pulled<unknown>>>>();
  /** Moves on at every clear, so an answer still on its way is not kept for whoever connects next. */
  private generation = 0;
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  /**
   * The kept answer if it is no older than `maxAge`, otherwise a new one from `fetch`. With a `null`
   * limit it never fetches, and the value is null when nothing is kept. Two askers at once share one
   * fetch rather than making two.
   */
  async get<T>(key: string, maxAge: MaxAge, fetch: () => Promise<GatewayResult<T>>): Promise<GatewayResult<Pulled<T> | null>> {
    const kept = this.kept.get(key) as Pulled<T> | undefined;
    if (maxAge === null) return { ok: true, value: kept ?? null };
    if (kept !== undefined && freshEnough(kept.pulledAt, maxAge, this.now())) return { ok: true, value: kept };

    const inFlight = this.running.get(key) as Promise<GatewayResult<Pulled<T>>> | undefined;
    if (inFlight !== undefined) return inFlight;

    const generation = this.generation;
    const started: Promise<GatewayResult<Pulled<T>>> = fetch()
      .then((result): GatewayResult<Pulled<T>> => {
        // A failure is not kept: the next look should try again, not repeat the error.
        if (!result.ok) return result;
        const pulled = { value: result.value, pulledAt: this.now().toISOString() };
        if (generation === this.generation) this.kept.set(key, pulled);
        return { ok: true, value: pulled };
      })
      .finally(() => {
        if (this.running.get(key) === started) this.running.delete(key);
      });
    this.running.set(key, started as Promise<GatewayResult<Pulled<unknown>>>);
    return started;
  }

  clear(): void {
    this.generation += 1;
    this.kept.clear();
    this.running.clear();
  }
}

/**
 * The renderer's limit, checked here rather than trusted. Left out, it means any kept answer will do,
 * which is what a caller that predates the setting expects. Undefined when it is not a limit at all.
 */
export function parseMaxAge(value: unknown): MaxAge | undefined {
  if (value === undefined) return Number.POSITIVE_INFINITY;
  if (value === null) return null;
  return typeof value === 'number' && !Number.isNaN(value) && value >= 0 ? value : undefined;
}
