import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

export default function LoginScreen({ onLogin }: { onLogin: (token: string) => void | Promise<void> }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api('/dev/login', { method: 'POST', body: { email: email.trim(), name: name.trim() } });
      await onLogin(r.accessToken);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <View style={s.wrap}>
      <Text style={s.logo}>🍑 Peach Live</Text>
      <Text style={s.sub}>Dev login (Google sign-in comes later)</Text>
      <TextInput style={s.input} placeholder="Email" placeholderTextColor={colors.muted}
        autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="Display name" placeholderTextColor={colors.muted}
        value={name} onChangeText={setName} />
      {!!err && <Text style={s.err}>{err}</Text>}
      <Btn label={busy ? 'Signing in...' : 'Continue'} onPress={submit} disabled={busy || !email || !name} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 12, maxWidth: 420, width: '100%', alignSelf: 'center' },
  logo: { color: colors.peach, fontSize: 34, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.muted, textAlign: 'center', marginBottom: 12 },
  input: { backgroundColor: colors.card, color: colors.text, padding: 12, borderRadius: 10 },
  err: { color: colors.error },
});


