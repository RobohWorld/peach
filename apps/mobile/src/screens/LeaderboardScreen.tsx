import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const PERIODS: [string, string][] = [['day', 'Today'], ['week', 'Week'], ['month', 'Month'], ['all', 'All time']];
const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`);

export default function LeaderboardScreen({ onBack, onOpenProfile }: {
  onBack: () => void; onOpenProfile: (username: string) => void;
}) {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setErr(''); setData(await api(`/leaderboards?period=${period}`)); }
    catch (e: any) { setErr(e.message); }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>🏆 Leaderboards</Text>
        <Pressable onPress={onBack}><Text style={s.link}>Back</Text></Pressable>
      </View>

      <View style={s.row}>
        {PERIODS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setPeriod(key)} style={[s.chip, period === key && s.chipOn]}>
            <Text style={[s.chipText, period === key && { color: '#fff' }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {!!err && <Text style={s.err}>{err}</Text>}
      {!data && !err && <Text style={s.muted}>Loading...</Text>}

      {data && (
        <>
          <Text style={s.section}>Top creators (💎 earned)</Text>
          {data.creators.length === 0 && <Text style={s.muted}>No gifts in this period yet.</Text>}
          {data.creators.map((r: any) => (
            <Pressable key={`c${r.rank}`} style={s.item} disabled={!r.username} onPress={() => r.username && onOpenProfile(r.username)}>
              <Text style={s.text}>{medal(r.rank)}  {r.name}{r.username ? `  @${r.username}` : ''}</Text>
              <Text style={s.text}>💎 {r.total}</Text>
            </Pressable>
          ))}

          <Text style={s.section}>Top gifters (🪙 spent)</Text>
          {data.gifters.length === 0 && <Text style={s.muted}>No gifts in this period yet.</Text>}
          {data.gifters.map((r: any) => (
            <View key={`g${r.rank}`} style={s.item}>
              <Text style={s.text}>{medal(r.rank)}  {r.name}</Text>
              <Text style={s.text}>🪙 {r.total}</Text>
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.peach, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  chipOn: { backgroundColor: colors.peach },
  chipText: { color: colors.peach, fontWeight: '700' },
  section: { color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 10 },
  item: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 10, padding: 12 },
  text: { color: colors.text },
  muted: { color: colors.muted },
  err: { color: colors.error },
});
