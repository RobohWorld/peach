import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Btn from './Btn';
import { colors } from '../lib/ui';
import type { GooglePayload } from '../lib/google';

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const SCOPE = 'openid email profile https://www.googleapis.com/auth/user.birthday.read';

export default function GoogleButton({ onToken }: { onToken: (p: GooglePayload) => Promise<void> }) {
  const client = useRef<any>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!CLIENT_ID) return;
    const init = () => {
      const g = (window as any).google;
      if (!g?.accounts?.oauth2) return;
      client.current = g.accounts.oauth2.initCodeClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        ux_mode: 'popup',
        callback: async (resp: any) => {
          if (resp?.error || !resp?.code) { setErr('Google sign-in was cancelled'); return; }
          setBusy(true); setErr('');
          try { await cb.current({ code: resp.code }); }
          catch (e: any) { setErr(e?.message ?? 'Google sign-in failed'); }
          finally { setBusy(false); }
        },
        error_callback: () => setErr('Google sign-in was cancelled'),
      });
      setReady(true);
    };
    if ((window as any).google?.accounts?.oauth2) init();
    else {
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client';
      sc.async = true;
      sc.onload = init;
      document.head.appendChild(sc);
    }
  }, []);

  if (!CLIENT_ID) return null;
  return (
    <View style={{ gap: 8 }}>
      <Btn label={busy ? 'Signing in...' : 'Continue with Google'} onPress={() => client.current?.requestCode()} disabled={!ready || busy} />
      {!!err && <Text style={{ color: colors.error }}>{err}</Text>}
    </View>
  );
}
