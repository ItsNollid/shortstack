// Data access for the renderer. The previous build refetched forever because the fetcher was a
// new function on every render and sat in the effect's dependency list. Here the fetcher lives in
// a ref and re-runs are driven by an explicit key plus backend events.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppEvent, Result } from '../../shared/ipc';

export interface QueryResult<T> {
  data: T | null;
  error: string | null;
  /** True only while the first load is in flight; refreshes keep the previous data visible. */
  loading: boolean;
  /** True whenever a request is in flight, refreshes included, for a button that says it is working. */
  fetching: boolean;
  refresh: () => void;
}

export interface QueryOptions {
  /** Changing this re-runs the fetcher. Include anything the fetcher closes over. */
  key?: string;
  /** Backend events that make this data stale. */
  invalidateOn?: readonly AppEvent[];
  enabled?: boolean;
}

export function useApiQuery<T>(fetcher: () => Promise<Result<T>>, options: QueryOptions = {}): QueryResult<T> {
  const { key = '', invalidateOn = [], enabled = true } = options;
  const events = invalidateOn.join(',');

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [fetching, setFetching] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setFetching(false);
      return;
    }
    let live = true;
    // A fetcher can throw before it returns a promise (no bridge, bad argument); treating that the
    // same as a rejection keeps one broken call from taking the whole screen down.
    let started: Promise<Result<T>>;
    try {
      started = fetcherRef.current();
    } catch (thrown: unknown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
      setLoading(false);
      setFetching(false);
      return;
    }
    setFetching(true);
    void started.then(
      (result) => {
        if (!live) return;
        if (result.ok) {
          setData(result.data);
          setError(null);
        } else {
          setError(result.error.message);
        }
        setLoading(false);
        setFetching(false);
      },
      (thrown: unknown) => {
        if (!live) return;
        setError(thrown instanceof Error ? thrown.message : String(thrown));
        setLoading(false);
        setFetching(false);
      }
    );
    // Ignoring a resolved response from a superseded request keeps the newest one authoritative.
    return () => {
      live = false;
    };
  }, [key, nonce, enabled]);

  useEffect(() => {
    if (events === '' || !enabled) return;
    const unsubscribes = events.split(',').map((event) => window.api.on(event as AppEvent, refresh));
    return () => unsubscribes.forEach((off) => off());
  }, [events, enabled, refresh]);

  return { data, error, loading, fetching, refresh };
}

export interface MutationResult<A extends unknown[], T> {
  run: (...args: A) => Promise<T | null>;
  /** The most recent successful result, for writes whose answer is worth showing. */
  data: T | null;
  pending: boolean;
  error: string | null;
  clearError: () => void;
}

/** Wraps a write so a failure surfaces as a message instead of an unhandled rejection, and so a
 *  button can disable itself while the write is in flight. */
export function useApiMutation<A extends unknown[], T>(
  action: (...args: A) => Promise<Result<T>>,
  options: { onDone?: (data: T) => void; onError?: (message: string) => void } = {}
): MutationResult<A, T> {
  const actionRef = useRef(action);
  actionRef.current = action;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: A): Promise<T | null> => {
    setPending(true);
    setError(null);
    try {
      const result = await actionRef.current(...args);
      if (result.ok) {
        if (mounted.current) setData(result.data);
        optionsRef.current.onDone?.(result.data);
        return result.data;
      }
      if (mounted.current) setError(result.error.message);
      optionsRef.current.onError?.(result.error.message);
      return null;
    } catch (thrown: unknown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      if (mounted.current) setError(message);
      optionsRef.current.onError?.(message);
      return null;
    } finally {
      if (mounted.current) setPending(false);
    }
  }, []);

  return { run, data, pending, error, clearError: useCallback(() => setError(null), []) };
}

/** Subscribes to a backend event for its payload (progress, toasts) rather than to invalidate. */
export function useAppEvent(event: AppEvent, listener: (payload: unknown) => void): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  useEffect(() => window.api.on(event, (payload) => listenerRef.current(payload)), [event]);
}
