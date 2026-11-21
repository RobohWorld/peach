import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Btn from './Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const fmt = (n: number) => n.toLocaleString('en-US');
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const date = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const PERKS: Record<number, string> = {
  1: 'Fan content',
  2: 'Fan and Supporter content',
  3: 'All subscriber content',
};

// Subscription tiers on a creator profile. Visitors subscribe/upgrade/cancel; the creator chooses which tiers to offer.
export default function SubscribePanel({ username, isMe }: { username: string; isMe: boolean }) {
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null); // "sub:2" | "cancel"
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setInfo(await api(`/creators/${encodeURIComponent(username)}/subscription`)); setErr(''); }
    catch (e: any) { setErr(e.message); }
  }, [username]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr('');
    try { await fn(); setConfirm(null); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!info) return err ? <Text style={s.err}>{err}</Text> : null;

  // ---------- creator view: choose offered tiers ----------
  if (isMe) {
    const enabled: number[] = info.tiers.filter((t: any) => t.enabled).map((t: any) => t.tier);
    const toggle = (tier: number) => {
      const next = enabled.includes(tier) ? enabled.filter((x) => x !== tier) : [...enabled, tier];
      run(() => api('/creator/subscription-tiers', { method: 'PUT', body: { tiers: next } }));
    };
    return (
      <View style={s.card}>
        <Text style={s.section}>Subscription tiers</Text>
        <Text style={s.muted}>
          {info.subscribers} active subscriber{info.subscribers === 1 ? '' : 's'}. Choose which tiers fans can join. People already subscribed keep their tier.
        </Text>
        {info.tiers.map((t: any) => (
          <Pressable key={t.tier} onPress={() => toggle(t.tier)} disabled={busy} style={[s.row, t.enabled && s.rowOn]}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{t.name} · {fmt(t.price)} coins / 30 days</Text>
              <Text style={s.muted}>{PERKS[t.tier]}</Text>
            </View>
            <Text style={[s.pill, t.enabled && s.pillOn]}>{t.enabled ? 'Offered' : 'Off'}</Text>
          </Pressable>
        ))}
        {!!err && <Text style={s.err}>{err}</Text>}
      </View>
    );
  }

  // ---------- visitor view ----------
  const offered = info.tiers.filter((t: any) => t.enabled || info.mine?.tier === t.tier);
  if (offered.length === 0 && !info.mine?.active) return null;

  const mine = info.mine?.active ? info.mine : null;
  const price = (tier: number) => info.tiers.find((t: any) => t.tier === tier)?.price ?? 0;

  // Estimated charge for an upgrade (the server does the exact math)
  const upgradeCost = (tier: number) => {
    if (!mine) return price(tier);
    const left = Math.max(0, new Date(mine.currentPeriodEnd).getTime() - Date.now());
    return Math.max(1, Math.ceil(((price(tier) - price(mine.tier)) * left) / PERIOD_MS));
  };

  const subscribe = (tier: number) => run(() => api(`/creators/${encodeURIComponent(username)}/subscribe`, { method: 'POST', body: { tier } }));

  return (
    <View style={s.card}>
      <Text style={s.section}>Subscribe</Text>

      {mine && (
        <Text style={s.text}>
          You are a {mine.tierName}.{' '}
          {mine.status === 'CANCELLED'
            ? `Access ends ${date(mine.currentPeriodEnd)}.`
            : `Renews ${date(mine.currentPeriodEnd)}.`}
          {mine.nextTier ? ` Switching to ${info.tiers.find((t: any) => t.tier === mine.nextTier)?.name} then.` : ''}
        </Text>
      )}

      {offered.map((t: any) => {
        const current = mine?.tier === t.tier;
        const higher = !!mine && t.tier > mine.tier;
        const lower = !!mine && t.tier < mine.tier;
        const key = `sub:${t.tier}`;
        const cost = higher ? upgradeCost(t.tier) : t.price;

        let label = `Subscribe · ${fmt(t.price)}`;
        if (current) label = mine.status === 'CANCELLED' ? 'Resume' : mine.nextTier ? 'Keep this tier' : 'Current tier';
        else if (higher) label = `Upgrade · about ${fmt(cost)} now`;
        else if (lower) label = 'Switch at renewal';
        const actionable = !(current && mine.status === 'ACTIVE' && !mine.nextTier);
        const free = current || lower; // no charge now

        return (
          <View key={t.tier} style={[s.row, current && s.rowOn]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.name}>{t.name} · {fmt(t.price)} coins / 30 days</Text>
              <Text style={s.muted}>{PERKS[t.tier]}</Text>
              {confirm === key && (
                <View style={{ gap: 6, marginTop: 6 }}>
                  <Text style={s.muted}>{free ? 'Confirm change?' : `Spend ${higher ? 'about ' : ''}${fmt(cost)} coins?`}</Text>
                  <Btn label="Confirm" onPress={() => subscribe(t.tier)} disabled={busy} />
                  <Btn label="Cancel" onPress={() => setConfirm(null)} outline />
                </View>
              )}
              {confirm !== key && actionable && (
                <View style={{ marginTop: 6 }}>
                  <Btn label={label} onPress={() => setConfirm(key)} disabled={busy} outline={current || lower} />
                </View>
              )}
              {confirm !== key && !actionable && <Text style={s.pillOn}>Current tier ✓</Text>}
            </View>
          </View>
        );
      })}

      {mine?.status === 'ACTIVE' && (
        confirm === 'cancel' ? (
          <View style={{ gap: 6 }}>
            <Text style={s.muted}>Stop renewing? You keep access until {date(mine.currentPeriodEnd)}.</Text>
            <Btn label="Yes, cancel renewal" onPress={() => run(() => api(`/subscriptions/${mine.id}/cancel`, { method: 'POST' }))} disabled={busy} />
            <Btn label="Keep subscription" onPress={() => setConfirm(null)} outline />
          </View>
        ) : (
          <Pressable onPress={() => setConfirm('cancel')}><Text style={s.link}>Cancel renewal</Text></Pressable>
        )
      )}
      {!!err && <Text style={s.err}>{err}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 10 },
  section: { color: colors.text, fontWeight: '700', fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'transparent' },
  rowOn: { borderColor: colors.peach },
  name: { color: colors.text, fontWeight: '700' },
  text: { color: colors.text },
  muted: { color: colors.muted, fontSize: 12 },
  pill: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  pillOn: { color: colors.peach, fontWeight: '700', fontSize: 12 },
  link: { color: colors.peach, fontWeight: '700', fontSize: 12 },
  err: { color: colors.error },
});
