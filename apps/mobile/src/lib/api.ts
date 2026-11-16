const BASE = process.env.EXPO_PUBLIC_API_URL as string;
let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = data?.message;
    throw new Error(m ? (Array.isArray(m) ? m.join(', ') : m) : `HTTP ${res.status}`);
  }
  return data as T;
}
