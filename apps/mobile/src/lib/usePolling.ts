import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export function usePolling(fn: () => void | Promise<unknown>, ms: number, deps: unknown[] = []) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      ref.current();
      timer = setInterval(() => ref.current(), ms);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => { stop(); sub.remove(); };
  }, [ms, ...deps]);
}