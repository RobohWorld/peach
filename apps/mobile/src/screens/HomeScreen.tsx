import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

export default function HomeScreen({ onOpenRoom, onLogout }: {
  onOpenRoom: (session: any) => void; onLogout: () => void;
}) {
  const [me, setMe] = useState<any>(null);
  const [live, setLive] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([api('/auth/me'), api('/streams/live')]);
      setMe(m); setLive(l); setErr('');
    } catch (e: any) { setErr(e.message); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const becomeCreator = () => run(async () => {
    await api('/dev/become-creator', { method: 'POST', body: { username: 'creator_' + Math.random().toString(36).slice(2, 8) } });
    await load();
  });

  const topup = () => run(async () => {
    await api('/dev/topup', { method: 'POST', body: { coins: 500 } });
    await load();
  });

  const goLive = () => run(async () => {
    const r = await api('/streams', { method: 'POST', body: { title: title.trim() || 'Live now' } });
    onOpenRoom({ ...r, publish: true });
  });

  const watch = (st: any) => run(async () => {
    const r = await api(`/streams/${st.id}/join`, { method: 'POST' });
    onOpenRoom({ ...r, publish: false });
  });

  const isCreator = me?.role === 'CREATOR';

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.logo}>🍑 Peach Live</Text>
        <Pressable onPress={onLogout}><Text style={s.link}>Log out</Text></Pressable>
      </View>

      {me && (
        <View style={s.card}>
          <Text style={s.name}>{me.name} {isCreator ? '· Creator' : ''}</Text>
          <Text style={s.muted}>Coins: {me.wallet?.coinBalance ?? 0}   Diamonds: {me.wallet?.diamondBalance ?? 0}</Text>
          <View style={s.row}>
            <View style={{ flex: 1 }}><Btn label="+500 coins (dev)" onPress={topup} disabled={busy} outline /></View>
            {!isCreator && <View style={{ flex: 1 }}><Btn label="Become creator (dev)" onPress={becomeCreator} disabled={busy} outline /></View>}
          </View>
        </View>
      )}

      {isCreator && (
        <View style={s.card}>
          <TextInput style={s.input} placeholder="Stream title" placeholderTextColor={colors.muted}
            value={title} onChangeText={setTitle} />
          <Btn label="Go live" onPress={goLive} disabled={busy} />
        </View>
      )}

      {!!err && <Text style={s.err}>{err}</Text>}

      <Text style={s.section}>Live now</Text>
      <FlatList
        data={live}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={<Text style={s.muted}>Nobody is live yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.stream} onPress={() => watch(item)}>
            <Text style={s.name}>{item.title}</Text>
            <Text style={s.muted}>by {item.creator?.name}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  link: { color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 10 },
  row: { flexDirection: 'row', gap: 8 },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.muted },
  section: { color: colors.text, fontWeight: '700', fontSize: 18, marginTop: 8 },
  stream: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8 },
  input: { backgroundColor: colors.bg, color: colors.text, padding: 12, borderRadius: 10 },
  err: { color: colors.error },
});
