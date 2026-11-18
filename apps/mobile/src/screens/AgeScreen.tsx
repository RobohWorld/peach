import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

export default function AgeScreen({ onDone, onLogout }: { onDone: () => Promise<void>; onLogout: () => void }) {
  const [dob, setDob] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(dob);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await api('/auth/confirm-age', { method: 'POST', body: { birthDate: dob } });
      await onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Confirm you are 18+</Text>
      <Text style={s.text}>
        Your Google account didn't share a birthday, so we need to ask once. We only check it:
        the date is not stored, only that you confirmed you are 18 or older.
      </Text>
      <TextInput style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted}
        value={dob} onChangeText={setDob} maxLength={10} autoCapitalize="none" />
      {!!err && <Text style={s.err}>{err}</Text>}
      <Btn label={busy ? 'Checking...' : 'I confirm I am 18 or older'} onPress={submit} disabled={busy || !valid} />
      <Pressable onPress={onLogout}><Text style={s.link}>Log out</Text></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 14, maxWidth: 420, width: '100%', alignSelf: 'center' },
  title: { color: colors.peach, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  text: { color: colors.muted, textAlign: 'center' },
  input: { backgroundColor: colors.card, color: colors.text, padding: 12, borderRadius: 10, textAlign: 'center', fontSize: 18 },
  err: { color: colors.error, textAlign: 'center' },
  link: { color: colors.muted, textAlign: 'center', marginTop: 6 },
});
