import 'expo-sqlite/localStorage/install';

const ls = () => (globalThis as any).localStorage;
export const storage = {
  get(k: string): string | null { try { return ls()?.getItem(k) ?? null; } catch { return null; } },
  set(k: string, v: string) { try { ls()?.setItem(k, v); } catch {} },
  del(k: string) { try { ls()?.removeItem(k); } catch {} },
};