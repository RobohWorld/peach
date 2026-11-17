import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import GoogleButton from '../components/GoogleButton';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

// Set EXPO_PUBLIC_DEV_LOGIN=false in production builds to hide the test login.
const SHOW_DEV = process.env.EXPO_PUBLIC_DEV_LOGIN !== 'false';

export default function LoginScreen({ onLogin }: { onLogin: (token: string) => void | Promise<void> }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const google = async (idToken: string) => {
    const r = await api('/auth/google', { method: 'POST', body: { idToken } });
    await onLogin(r.accessToken);
  };

  const dev = async () => {
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
      <GoogleButton onToken={google} />
      {SHOW_DEV && (
        <>
          <Text style={s.sub}>or test login</Text>
          <TextInput style={s.input} placeholder="Email" placeholderTextColor={colors.muted}
            autoCapitalize="none" value={email} onChangeText={setEmail} />
          <TextInput style={s.input} placeholder="Display name" placeholderTextColor={colors.muted}
            value={name} onChangeText={setName} />
          <Btn label={busy ? 'Signing in...' : 'Continue'} onPress={dev} disabled={busy || !email || !name} />
        </>
      )}
      {!!err && <Text style={s.err}>{err}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 12, maxWidth: 420, width: '100%', alignSelf: 'center' },
  logo: { color: colors.peach, fontSize: 34, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  sub: { color: colors.muted, textAlign: 'center' },
  input: { backgroundColor: colors.card, color: colors.text, padding: 12, borderRadius: 10 },
  err: { color: colors.error },
});
