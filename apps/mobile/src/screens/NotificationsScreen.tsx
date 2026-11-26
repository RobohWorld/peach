import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};

export default function NotificationsScreen({ onBack, onOpen }: {
  onBack: () => void; onOpen: (data: any) => void;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (after?: string | null) => {
    try {
      const r = await api(`/me/notifications${after ? `?cursor=${after}` : ''}`);
      setItems((prev) => (after ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor); setErr('');
      if (!after) api('/me/notifications/read', { method: 'POST' }).catch(() => {}); // clears the badge
    } catch (e: any) { setErr(e.message); } finally { setLoaded(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>Notifications</Text>
        <Pressable onPress={onBack}><Text style={s.link}>Back</Text></Pressable>
      </View>
      {!!err && <Text style={s.err}>{err}</Text>}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        onEndReached={() => { if (cursor) load(cursor); }}
        ListEmptyComponent={loaded ? <Text style={s.muted}>Nothing yet. Follow creators to get live alerts here.</Text> : undefined}
        contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
        renderItem={({ item }) => (
          <Pressable style={[s.row, !item.readAt && s.unread]} onPress={() => onOpen(item.data)}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.title}</Text>
              <Text style={s.muted}>{item.body}</Text>
            </View>
            <Text style={s.muted}>{ago(item.createdAt)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  link: { color: colors.peach, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, backgroundColor: colors.card, borderRadius: 12, padding: 14, alignItems: 'center' },
  unread: { borderLeftWidth: 3, borderLeftColor: colors.peach },
  name: { color: colors.text, fontWeight: '700' },
  muted: { color: colors.muted },
  err: { color: colors.error },
});