import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

export default function ExploreScreen({
  onOpenProfile, onOpenLeaderboard,
}: { onOpenProfile: (username: string) => void; onOpenLeaderboard: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [err, setErr] = useState('');

  const loadFollowing = useCallback(async () => {
    try { setFollowing(await api('/me/following')); setErr(''); } catch (e: any) { setErr(e.message); }
  }, []);

  useEffect(() => { loadFollowing(); }, [loadFollowing]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { setResults(await api(`/creators/search?q=${encodeURIComponent(term)}`)); setErr(''); }
      catch (e: any) { setErr(e.message); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const searching = q.trim().length >= 2;
  const data = searching ? results : following;

  const header = (
    <View style={{ gap: 12 }}>
      <Text style={s.title}>Explore</Text>
      <TextInput style={s.input} placeholder="Find creators" placeholderTextColor={colors.muted}
        autoCapitalize="none" value={q} onChangeText={setQ} />
      <Btn label="🏆 Leaderboards" onPress={onOpenLeaderboard} outline />
      {!!err && <Text style={s.err}>{err}</Text>}
      <Text style={s.section}>{searching ? 'Results' : 'Creators you follow'}</Text>
    </View>
  );

  return (
    <FlatList
      style={s.wrap}
      contentContainerStyle={{ padding: 16, gap: 8, maxWidth: 520, width: '100%', alignSelf: 'center' }}
      data={data}
      keyExtractor={(i) => i.username}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <Text style={s.muted}>{searching ? 'No creators found.' : 'You are not following anyone yet. Search for a creator above.'}</Text>
      }
      renderItem={({ item }) => (
        <Pressable style={s.row} onPress={() => onOpenProfile(item.username)}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{item.name}</Text>
            <Text style={s.muted}>
              @{item.username}
              {typeof item.followers === 'number' ? ` · ${item.followers} follower${item.followers === 1 ? '' : 's'}` : ''}
            </Text>
          </View>
          {!!item.liveStreamId && <Text style={s.live}>🔴 Live</Text>}
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  section: { color: colors.text, fontWeight: '700', fontSize: 18, marginTop: 8 },
  input: { backgroundColor: colors.card, color: colors.text, padding: 12, borderRadius: 10 },
  row: { backgroundColor: colors.card, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.muted },
  live: { color: colors.peach, fontWeight: '700' },
  err: { color: colors.error },
});
