import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { storage } from './storage';

// Stale-while-revalidate cache.
// - Screens show the saved copy instantly (memory first, then phone storage).
// - A fresh request only runs when the saved copy is older than `staleMs`.
// - The screen only re-renders when the server data actually changed.
// - Cached data is scoped to the logged-in user, so accounts never see each other's data.

type Entry<T> = { at: number; data: T };

let scope = '';
const mem = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const k = (path: string) => `cache:v1:${scope}:${path}`;

/** Call with the user id after login, and with null on logout. */
export function setCacheScope(userId: string | null) {
  scope = userId ?? '';
  mem.clear();
  inflight.clear();
}

export function readCache<T>(path: string): Entry<T> | null {
  if (!scope) return null;
  const hit = mem.get(k(path));
  if (hit) return hit as Entry<T>;
  const raw = storage.get(k(path));
  if (!raw) return null;
  try {
    const e = JSON.parse(raw) as Entry<T>;
    if (typeof e?.at !== 'number') return null;
    mem.set(k(path), e);
    return e;
  } catch {
    return null;
  }
}

export function writeCache<T>(path: string, data: T, persist = true) {
  if (!scope) return;
  const e: Entry<T> = { at: Date.now(), data };
  mem.set(k(path), e);
  if (persist) {
    try {
      storage.set(k(path), JSON.stringify(e));
    } catch {
      // storage full or unavailable: memory copy still works
    }
  }
}

/** GET with de-duplication: parallel callers share one request. */
export async function fetchCached<T>(path: string): Promise<{ data: T; changed: boolean }> {
  const key = k(path);
  const running = inflight.get(key) as Promise<{ data: T; changed: boolean }> | undefined;
  if (running) return running;

  const p = (async () => {
    try {
      const data = await api<T>(path);
      const old = readCache<T>(path);
      const changed = !old || JSON.stringify(old.data) !== JSON.stringify(data);
      writeCache(path, data, changed); // unchanged data: only refresh the timestamp in memory
      return { data, changed };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

type Opts = {
  /** Saved copy is considered fresh for this long (no request is made). Default 60s. */
  staleMs?: number;
  /** Re-check the server this often while the app is open. 0 = never. */
  pollMs?: number;
  /** Set false to pause (for example while another screen is on top). */
  enabled?: boolean;
};

export function useCachedQuery<T = any>(path: string | null, opts: Opts = {}) {
  const { staleMs = 60_000, pollMs = 0, enabled = true } = opts;

  const first = path ? readCache<T>(path) : null;
  const [data, setData] = useState<T | undefined>(first?.data);
  const [loaded, setLoaded] = useState(!!first);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const alive = useRef(true);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (force: boolean) => {
      if (!path || !enabled) return;
      const cached = readCache<T>(path);
      if (!force && cached && Date.now() - cached.at < staleMs) return;
      try {
        const r = await fetchCached<T>(path);
        if (!alive.current || pathRef.current !== path) return;
        if (r.changed) setData(r.data);
        setError('');
        setLoaded(true);
      } catch (e: any) {
        if (!alive.current || pathRef.current !== path) return;
        setError(e?.message ?? 'Something went wrong');
        setLoaded(true);
      }
    },
    [path, staleMs, enabled],
  );

  // Path changed (new filter or search): show its saved copy right away, then refresh if stale.
  useEffect(() => {
    const c = path ? readCache<T>(path) : null;
    setData(c?.data);
    setLoaded(!!c);
    run(false);
  }, [path, run]);

  // Optional polling, foreground only.
  useEffect(() => {
    if (!pollMs || !path || !enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        run(true);
      }, pollMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        run(false);
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [pollMs, path, enabled, run]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await run(true);
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [run]);

  /** Replace the data locally (for example after the user does something). */
  const mutate = useCallback(
    (next: T) => {
      if (path) writeCache(path, next);
      setData(next);
    },
    [path],
  );

  return { data, loaded, error, refreshing, refresh, mutate };
}
