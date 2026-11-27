import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator ,  Pressable} from 'react-native';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const CATS = ['chat', 'music', 'dance', 'gaming', 'fitness', 'talk', 'other'];

export default function GoLiveScreen({
  onOpenRoom, onOpenApply,
}: { onOpenRoom: (session: any) => void; onOpenApply: () => void }) {
  const [me, setMe] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState('chat');
const [tagText, setTagText] = useState('');

  useEffect(() => {
    api('/auth/me').then(setMe).catch((e) => setErr(e.message));
  }, []);

  const start = async () => {
    const tags = tagText.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 5);
    setBusy(true); setErr('');
    try {
  const r = await api('/streams', { method: 'POST', body: { title: title.trim() || 'Live now', category, tags } });
      onOpenRoom({ ...r, publish: true });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!me && !err) {
    return <View style={s.wrap}><ActivityIndicator color={colors.peach} /></View>;
  }

  const isCreator = me?.role === 'CREATOR';

  return (
    <View style={s.wrap}>
      <View style={s.box}>
        {isCreator ? (
          <>
            <Text style={s.title}>Start a live stream</Text>
            <TextInput style={s.input} placeholder="Stream title" placeholderTextColor={colors.muted}
              value={title} onChangeText={setTitle} maxLength={80} />
              <Text style={s.muted}>By going live you agree to follow the Community Guidelines.</Text>
            <Btn label="Go live" onPress={start} disabled={busy} />
          </>
        ) : (
          <>
            <Text style={s.title}>Become a creator</Text>
            <Text style={s.muted}>
              Apply to stream, earn diamonds from gifts, and sell your photos and videos.
            </Text>

            <View style={s.chips}>
  {CATS.map((c) => (
    <Pressable key={c} onPress={() => setCategory(c)} style={[s.chip, category === c && s.chipOn]}>
      <Text style={[s.chipText, category === c && { color: '#fff' }]}>{c}</Text>
    </Pressable>
  ))}
</View>
<TextInput style={s.input} placeholder="Tags, comma separated (max 5)" placeholderTextColor={colors.muted}
  value={tagText} onChangeText={setTagText} autoCapitalize="none" maxLength={80} />
            <Btn label="Apply now" onPress={onOpenApply} />
          </>
        )}
        {!!err && <Text style={s.err}>{err}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 16 },
  box: { backgroundColor: colors.card, borderRadius: 12, padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.muted },
  input: { backgroundColor: colors.bg, color: colors.text, padding: 12, borderRadius: 10 },
  err: { color: colors.error },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
chip: { borderWidth: 1, borderColor: colors.peach, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
chipOn: { backgroundColor: colors.peach },
chipText: { color: colors.peach, fontWeight: '700' },
});