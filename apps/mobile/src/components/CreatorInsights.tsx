import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const fmt = (n: number) => n.toLocaleString('en-US');
const TIER = ['', 'Fan', 'Supporter', 'VIP'];

const Row = ({ left, right }: { left: string; right: string }) => (
  <View style={s.row}><Text style={s.text} numberOfLines={1}>{left}</Text><Text style={s.text}>{right}</Text></View>
);

export default function CreatorInsights() {
  const [days, setDays] = useState<7 | 30>(7);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setD(null); setErr('');
    api(`/creator/dashboard?days=${days}`).then(setD).catch((e) => setErr(e.message));
  }, [days]);

  const max = Math.max(1, ...((d?.daily ?? []).map((x: any) => x.diamonds)));
  const na = d?.needsAttention;

  return (
    <View style={{ gap: 10 }}>
      <View style={s.chips}>
        {([7, 30] as const).map((n) => (
          <Pressable key={n} onPress={() => setDays(n)} style={[s.chip, days === n && s.chipOn]}>
            <Text style={[s.chipText, days === n && { color: '#fff' }]}>Last {n} days</Text>
          </Pressable>
        ))}
      </View>
      {!!err && <Text style={s.err}>{err}</Text>}
      {!d && !err && <Text style={s.muted}>Loading...</Text>}

      {d && (
        <>
          {(na.openRefundCases > 0 || na.flaggedItems > 0 || na.pendingReview > 0) && (
            <View style={s.alert}>
              <Text style={s.text}>Needs your attention</Text>
              {na.flaggedItems > 0 && <Text style={s.muted}>• {na.flaggedItems} item(s) hidden while a report is reviewed</Text>}
              {na.pendingReview > 0 && <Text style={s.muted}>• {na.pendingReview} item(s) awaiting approval</Text>}
              {na.openRefundCases > 0 && <Text style={s.muted}>• {na.openRefundCases} refund case(s) under admin review</Text>}
            </View>
          )}

          <Text style={s.section}>Income by source</Text>
          <Row left="🎁 Gifts" right={`💎 ${fmt(d.period.gifts)}`} />
          <Row left="🖼️ Content sales" right={`💎 ${fmt(d.period.content)}`} />
          <Row left="⭐ Subscriptions" right={`💎 ${fmt(d.period.subscriptions)}`} />
          {d.period.refunds !== 0 && <Row left="↩️ Refund clawbacks" right={`💎 ${fmt(d.period.refunds)}`} />}
          <Row left="Total" right={`💎 ${fmt(d.period.total)}`} />

          <View style={s.chart}>
            {d.daily.map((x: any) => (
              <View key={x.date} style={s.barCol}>
                <View style={[s.bar, { height: Math.max(3, (x.diamonds / max) * 90) }]} />
              </View>
            ))}
          </View>

          <Text style={s.section}>Audience</Text>
          <Row left="Followers" right={`${fmt(d.audience.followers)} (+${fmt(d.audience.newFollowers)})`} />
          <Row left="Active subscribers" right={fmt(d.subscribers.active)} />
          {d.subscribers.cancelling > 0 && <Row left="Cancelling (access until period end)" right={fmt(d.subscribers.cancelling)} />}
          {d.subscribers.byTier.map((t: any) => (
            <Row key={t.tier} left={`${TIER[t.tier]} tier`} right={fmt(t.count)} />
          ))}
          <Row left={`New / lapsed (${d.days}d)`} right={`${d.subscribers.new} / ${d.subscribers.lapsed}`} />

          <Text style={s.section}>Top content ({d.days}d)</Text>
          {d.topContent.length === 0 && <Text style={s.muted}>No content sales yet.</Text>}
          {d.topContent.map((t: any) => (
            <Row key={t.mediaId} left={`${t.type === 'VIDEO' ? '🎬' : '🖼️'} ${t.title}`} right={`${t.sales} sold · 🪙 ${fmt(t.coins)}`} />
          ))}

          <Text style={s.section}>Stream history</Text>
          {d.streamHistory.length === 0 && <Text style={s.muted}>No streams yet.</Text>}
          {d.streamHistory.map((x: any) => (
            <View key={x.streamId} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.text} numberOfLines={1}>{x.live ? '🔴 ' : ''}{x.title}</Text>
                <Text style={s.muted}>{new Date(x.startedAt).toLocaleDateString()} · {x.minutes} min · {x.gifts} gifts</Text>
              </View>
              <Text style={s.text}>💎 {fmt(x.diamonds)}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, backgroundColor: colors.card, borderRadius: 10, padding: 10 },
  text: { color: colors.text },
  muted: { color: colors.muted },
  err: { color: colors.error },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.peach, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  chipOn: { backgroundColor: colors.peach },
  chipText: { color: colors.peach, fontWeight: '700' },
  alert: { backgroundColor: colors.card, borderRadius: 10, padding: 12, gap: 4, borderLeftWidth: 3, borderLeftColor: colors.peach },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, backgroundColor: colors.card, borderRadius: 12, padding: 12, height: 120 },
  barCol: { flex: 1, justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.peach, borderRadius: 2 },
});