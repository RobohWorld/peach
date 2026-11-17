import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import Btn from './Btn';
import { colors } from '../lib/ui';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export default function GoogleButton({ onToken }: { onToken: (idToken: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (WEB_CLIENT_ID) GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  }, []);

  if (!WEB_CLIENT_ID) return null;

  const press = async () => {
    setBusy(true); setErr('');
    try {
      await GoogleSignin.hasPlayServices();
      const res = await GoogleSignin.signIn();
      if (isSuccessResponse(res) && res.data.idToken) await onToken(res.data.idToken);
    } catch (e: any) {
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return;
      setErr(e?.message ? String(e.message) : 'Google sign-in failed');
    } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 8 }}>
      <Btn label={busy ? 'Signing in...' : 'Continue with Google'} onPress={press} disabled={busy} />
      {!!err && <Text style={{ color: colors.error }}>{err}</Text>}
    </View>
  );
}
