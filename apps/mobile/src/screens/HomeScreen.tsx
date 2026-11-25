import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { api } from '../lib/api';
import { colors } from '../lib/ui';
import WalletChip from '../components/WalletChip';

const SORTS: [string, string][] = [['popular', 'Popular'], ['new', 'New'], ['following', 'Following']];

export default function HomeScreen({
  onOpenRoom, onOpenProfile,  onOpenWallet,
}: {
  onOpenRoom: (session: any) => void; onOpenProfile: (username: string) => void; onOpenWallet: () => void;
}) {
  const [live, setLive] = useState<any[]>([]);
  const [creators, setCreators] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('popular');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const term = q.trim();
      const searching = term.length >= 2;
      const qs = `sort=${sort}${searching ? `&q=${encodeURIComponent(term)}` : ''}`;
      const [l, c] = await Promise.all([
        api(`/streams/live?${qs}`),
        searching ? api(`/creators/search?q=${encodeURIComponent(term)}`) : Promise.resolve([]),
      ]);
      setLive(l); setCreators(c); setErr('');
    } catch (e: any) { setErr(e.message); }
  }, [q, sort]);

  useEffect(() => {
    const first = setTimeout(load, 350);
    const poll = setInterval(load, 10000);
    return () => { clearTimeout(first); clearInterval(poll); };
  }, [load]);

  const watch = async (st: any) => {
    setBusy(true); setErr('');
    try {
      const r = await api(`/streams/${st.id}/join`, { method: 'POST' });
      onOpenRoom({ ...r, publish: false });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const header = (
    <View style={s.top}>
     <Text style={s.logo}>🍑 Peach Live</Text>
     <WalletChip onPress={onOpenWallet} />
      
      <TextInput style={s.input} placeholder="Search streams and creators" placeholderTextColor={colors.muted}
        autoCapitalize="none" value={q} onChangeText={setQ} />

      <View style={s.row}>
        {SORTS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setSort(key)} style={[s.chip, sort === key && s.chipOn]}>
            <Text style={[s.chipText, sort === key && { color: '#fff' }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {!!err && <Text style={s.err}>{err}</Text>}

      {creators.length > 0 && (
        <>
          <Text style={s.section}>Creators</Text>
          {creators.map((c) => (
            <Pressable key={c.username} style={s.stream} onPress={() => onOpenProfile(c.username)}>
              <Text style={s.name}>{c.name}</Text>
              <Text style={s.muted}>@{c.username} · {c.followers} follower{c.followers === 1 ? '' : 's'}</Text>
            </Pressable>
          ))}
        </>
      )}

      <Text style={s.section}>Live now</Text>
    </View>
  );

  return (
    <FlatList
      style={s.wrap}
      contentContainerStyle={{ padding: 16, gap: 8, maxWidth: 520, width: '100%', alignSelf: 'center' }}
      data={live}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <Text style={s.muted}>{sort === 'following' ? 'None of the creators you follow are live.' : 'Nobody is live yet.'}</Text>
      }
      renderItem={({ item }) => (
        <Pressable style={s.stream} onPress={() => watch(item)} disabled={busy}>
          <Text style={s.name}>🔴 {item.title}</Text>
          <Text style={s.muted}>{item.creator?.name}{item.creator?.username ? ` · @${item.creator.username}` : ''}</Text>
          <View style={s.row}>
            <Text style={s.muted}>👁 {item.viewers}   ♥ {item.followers}</Text>
            {!!item.creator?.username && (
              <Pressable onPress={() => onOpenProfile(item.creator.username)}>
                <Text style={s.link2}>View profile</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wrap: { flex: 1, backgroundColor: colors.bg },
  logo: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  link2: { color: colors.peach, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.muted },
  section: { color: colors.text, fontWeight: '700', fontSize: 18, marginTop: 8 },
  stream: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 4 },
  input: { backgroundColor: colors.card, color: colors.text, padding: 12, borderRadius: 10 },
  chip: { borderWidth: 1, borderColor: colors.peach, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  chipOn: { backgroundColor: colors.peach },
  chipText: { color: colors.peach, fontWeight: '700' },
  err: { color: colors.error },
});
