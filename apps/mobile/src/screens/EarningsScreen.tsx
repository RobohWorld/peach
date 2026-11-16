import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <View style={s.stat}>
    <Text style={s.statValue}>{value}</Text>
    <Text style={s.muted}>{label}</Text>
  </View>
);

export default function EarningsScreen({ onBack }: { onBack: () => void }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/creator/earnings').then(setD).catch((e) => setErr(e.message));
  }, []);

  const max = Math.max(1, ...((d?.daily ?? []).map((x: any) => x.diamonds)));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>Earnings</Text>
        <Pressable onPress={onBack}><Text style={s.link}>Back</Text></Pressable>
      </View>

      {!!err && <Text style={s.err}>{err}</Text>}
      {!d && !err && <Text style={s.muted}>Loading...</Text>}

      {d && (
        <>
          <View style={s.grid}>
            <Stat label="Diamond balance" value={`💎 ${d.diamondBalance}`} />
            <Stat label="Last 7 days" value={d.last7Days} />
            <Stat label="Last 30 days" value={d.last30Days} />
            <Stat label="Lifetime" value={d.lifetimeDiamonds} />
            <Stat label="Gifts (30d)" value={d.giftCount30d} />
            <Stat label="Gifts (lifetime)" value={d.lifetimeGifts} />
          </View>

          <Text style={s.section}>Last 7 days</Text>
          <View style={s.chart}>
            {d.daily.map((x: any) => (
              <View key={x.date} style={s.barCol}>
                <Text style={s.barVal}>{x.diamonds || ''}</Text>
                <View style={[s.bar, { height: Math.max(3, (x.diamonds / max) * 90) }]} />
                <Text style={s.muted}>{x.date.slice(5)}</Text>
              </View>
            ))}
          </View>

          <Text style={s.section}>Top gifters (30d)</Text>
          {d.topGifters.length === 0 && <Text style={s.muted}>No gifts yet.</Text>}
          {d.topGifters.map((g: any) => (
            <View key={g.userId} style={s.row}><Text style={s.text}>{g.name}</Text><Text style={s.text}>💎 {g.diamonds}</Text></View>
          ))}

          <Text style={s.section}>Top streams (30d)</Text>
          {d.topStreams.length === 0 && <Text style={s.muted}>No streams with gifts yet.</Text>}
          {d.topStreams.map((x: any) => (
            <View key={x.streamId} style={s.row}><Text style={s.text}>{x.title}</Text><Text style={s.text}>💎 {x.diamonds}</Text></View>
          ))}

          <Text style={s.section}>Recent gifts</Text>
          {d.recent.length === 0 && <Text style={s.muted}>Nothing yet.</Text>}
          {d.recent.map((r: any, i: number) => (
            <View key={i} style={s.row}>
              <Text style={s.text}>{r.emoji} {r.from} · {r.gift}</Text>
              <Text style={s.text}>+{r.diamonds}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  link: { color: colors.peach, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { backgroundColor: colors.card, borderRadius: 12, padding: 12, minWidth: 150, flexGrow: 1 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  section: { color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 10 },
  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', backgroundColor: colors.card, borderRadius: 12, padding: 12, height: 150 },
  barCol: { alignItems: 'center', justifyContent: 'flex-end', flex: 1, gap: 2 },
  bar: { width: 18, backgroundColor: colors.peach, borderRadius: 4 },
  barVal: { color: colors.muted, fontSize: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 10, padding: 10 },
  text: { color: colors.text },
  muted: { color: colors.muted },
  err: { color: colors.error },
});
