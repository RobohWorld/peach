import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import { GUIDELINES, GUIDELINES_INTRO } from '../lib/guidelines';
import { colors } from '../lib/ui';

export default function GuidelinesScreen({ onBack, onAccept, onLogout }: {
  onBack?: () => void;
  onAccept?: () => Promise<void>;
  onLogout?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const accept = async () => {
    if (!onAccept) return;
    setBusy(true); setErr('');
    try { await onAccept(); } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>Community guidelines</Text>
        {onBack && <Pressable onPress={onBack} hitSlop={8}><Text style={s.link}>Back</Text></Pressable>}
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.intro}>{GUIDELINES_INTRO}</Text>
        {GUIDELINES.map((g, i) => (
          <View key={g.title} style={s.card}>
            <Text style={s.cardTitle}>{i + 1}. {g.title}</Text>
            <Text style={s.text}>{g.body}</Text>
          </View>
        ))}
      </ScrollView>
      {onAccept && (
        <View style={s.footer}>
          {!!err && <Text style={s.err}>{err}</Text>}
          <Btn label={busy ? 'Saving...' : 'I agree and continue'} onPress={accept} disabled={busy} />
          {onLogout && <Pressable onPress={onLogout} hitSlop={8}><Text style={s.muted}>Log out</Text></Pressable>}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { color: colors.peach, fontSize: 24, fontWeight: '800', flex: 1 },
  link: { color: colors.peach, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  intro: { color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 6 },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  text: { color: colors.muted },
  footer: { padding: 16, gap: 10, alignItems: 'center' },
  muted: { color: colors.muted },
  err: { color: colors.error, textAlign: 'center' },
});