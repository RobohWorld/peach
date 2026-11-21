export const TIERS: Record<number, { name: string; price: number }> = {
  1: { name: 'Fan', price: 10_000 },
  2: { name: 'Supporter', price: 25_000 },
  3: { name: 'VIP', price: 50_000 },
};
export const TIER_NUMBERS = [1, 2, 3];
export const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
