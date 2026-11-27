import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

export default function ApplyScreen({ onBack }: { onBack: () => void }) {
  const [app, setApp] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setApp(await api('/creator/application')); } catch (e: any) { setErr(e.message); }
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await api('/creator/apply', { method: 'POST', body: { username: username.trim(), bio: bio.trim() } });
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const pending = app?.status === 'PENDING';
  const canApply = loaded && !pending;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>Become a creator</Text>
        <Pressable onPress={onBack}><Text style={s.link}>Back</Text></Pressable>
      </View>

      {pending && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Application under review</Text>
          <Text style={s.muted}>@{app.username} · sent {new Date(app.createdAt).toLocaleDateString()}</Text>
          <Text style={s.muted}>We'll approve it after checking your age and identity.</Text>
        </View>
      )}

      {app?.status === 'REJECTED' && (
        <View style={s.card}>
          <Text style={[s.cardTitle, { color: colors.error }]}>Your last application was not approved</Text>
          {!!app.adminNote && <Text style={s.muted}>Reason: {app.adminNote}</Text>}
          <Text style={s.muted}>You can apply again below.</Text>
        </View>
      )}

      {canApply && (
        <View style={s.card}>
          <Text style={s.muted}>Creators must be 18+ and follow the Community Guidelines. Approval needs a manual check of your age and identity.</Text>
          <TextInput style={s.input} placeholder="Username (3-20 letters, numbers, _)" placeholderTextColor={colors.muted}
            autoCapitalize="none" value={username} onChangeText={setUsername} maxLength={20} />
          <TextInput style={[s.input, { height: 90 }]} placeholder="Short bio (optional)" placeholderTextColor={colors.muted}
            multiline value={bio} onChangeText={setBio} maxLength={300} />
          {!!err && <Text style={s.err}>{err}</Text>}
          <Btn label={busy ? 'Sending...' : 'Send application'} onPress={submit} disabled={busy || username.trim().length < 3} />
        </View>
      )}
      {!canApply && !!err && <Text style={s.err}>{err}</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  link: { color: colors.peach, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 10 },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  input: { backgroundColor: colors.bg, color: colors.text, padding: 12, borderRadius: 10 },
  muted: { color: colors.muted },
  err: { color: colors.error },
});
