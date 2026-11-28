import { api } from './api';
import { storage } from './storage';

export const COUNTRIES: [string, string][] = [
  ['PK', 'Pakistan'], ['IN', 'India'], ['BD', 'Bangladesh'], ['LK', 'Sri Lanka'], ['NP', 'Nepal'],
  ['AF', 'Afghanistan'], ['IR', 'Iran'], ['IQ', 'Iraq'], ['SA', 'Saudi Arabia'], ['AE', 'United Arab Emirates'],
  ['QA', 'Qatar'], ['KW', 'Kuwait'], ['TR', 'Turkey'], ['EG', 'Egypt'], ['NG', 'Nigeria'],
  ['ZA', 'South Africa'], ['KE', 'Kenya'], ['US', 'United States'], ['CA', 'Canada'], ['MX', 'Mexico'],
  ['BR', 'Brazil'], ['AR', 'Argentina'], ['CO', 'Colombia'], ['CL', 'Chile'], ['GB', 'United Kingdom'],
  ['IE', 'Ireland'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'],
  ['NL', 'Netherlands'], ['SE', 'Sweden'], ['PL', 'Poland'], ['UA', 'Ukraine'], ['RU', 'Russia'],
  ['CN', 'China'], ['JP', 'Japan'], ['KR', 'South Korea'], ['ID', 'Indonesia'], ['MY', 'Malaysia'],
  ['PH', 'Philippines'], ['TH', 'Thailand'], ['VN', 'Vietnam'], ['AU', 'Australia'], ['NZ', 'New Zealand'],
];

/** "PK" becomes the flag emoji. Returns '' for anything that is not a 2-letter code. */
export function flag(cc?: string | null): string {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(
    ...cc.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)),
  );
}

export function countryName(cc?: string | null): string {
  if (!cc) return '';
  return COUNTRIES.find((c) => c[0] === cc.toUpperCase())?.[1] ?? cc.toUpperCase();
}

/** Best guess from the phone's region setting, for example "en-PK" gives "PK". */
export function detectCountry(): string | null {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale;
    const m = /[-_]([A-Za-z]{2})(?:$|[-_])/.exec(loc);
    return m ? m[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

const key = (userId: string) => `country:${userId}`;

export function savedCountry(userId?: string | null): string | null {
  return userId ? storage.get(key(userId)) : null;
}

/** Saves the country on the server, then remembers it on this phone. Throws if the server refuses. */
export async function saveCountry(userId: string, cc: string): Promise<void> {
  await api('/streams/country', { method: 'PUT', body: { country: cc } });
  storage.set(key(userId), cc);
}

/** One-time automatic setup from the phone region. Never shows errors. */
export function ensureCountrySynced(userId?: string | null) {
  if (!userId || savedCountry(userId)) return;
  const cc = detectCountry();
  if (!cc) return;
  saveCountry(userId, cc).catch(() => {});
}
