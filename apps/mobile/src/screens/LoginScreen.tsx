import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import GoogleButton from '../components/GoogleButton';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

export default function LoginScreen({ onLogin }: { onLogin: (token: string) => void | Promise<void> }) {
  const [err, setErr] = useState('');

  const google = async (idToken: string) => {
    setErr('');
    try {
      const r = await api('/auth/google', { method: 'POST', body: { idToken } });
      await onLogin(r.accessToken);
    } catch (e: any) {
      setErr(e.message);
      throw e;
    }
  };

  return (
    <View style={s.wrap}>
      <Text style={s.logo}>🍑 Peach Live</Text>
      <Text style={s.sub}>Adults only (18+). Sign in to continue.</Text>
      <GoogleButton onToken={google} />
      {!!err && <Text style={s.err}>{err}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 14, maxWidth: 420, width: '100%', alignSelf: 'center' },
  logo: { color: colors.peach, fontSize: 34, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.muted, textAlign: 'center', marginBottom: 8 },
  err: { color: colors.error, textAlign: 'center' },
});
