import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet } from 'react-native';
import MediaViewer from '../components/MediaViewer';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

// Everything the user has unlocked.
export default function LibraryScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setItems(await api('/me/library')); setErr(''); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const header = (
    <View style={s.top}>
      <Pressable onPress={onBack}><Text style={s.back}>‹ Back</Text></Pressable>
      <Text style={s.title}>My library</Text>
      <View style={{ width: 50 }} />
    </View>
  );

  return (
    <>
      <FlatList
        style={s.wrap}
        contentContainerStyle={{ padding: 16, gap: 8, maxWidth: 520, width: '100%', alignSelf: 'center' }}
        data={items ?? []}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={<View style={{ gap: 8 }}>{header}{!!err && <Text style={s.err}>{err}</Text>}</View>}
        ListEmptyComponent={items ? <Text style={s.muted}>You have not unlocked anything yet.</Text> : undefined}
        renderItem={({ item }) => (
          <Pressable style={s.row} onPress={() => setViewing(item)}>
            <View style={s.thumb}>
              {item.previewUrl
                ? <Image source={{ uri: item.previewUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                : <Text style={{ fontSize: 24 }}>🎬</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{item.title}</Text>
              <Text style={s.muted}>{item.creatorName}{item.durationSec ? ` · ${item.durationSec}s` : ''}</Text>
            </View>
          </Pressable>
        )}
      />
      <MediaViewer item={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { color: colors.peach, fontWeight: '700', width: 50 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  row: { backgroundColor: colors.card, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2c2438', alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.muted },
  err: { color: colors.error },
});
