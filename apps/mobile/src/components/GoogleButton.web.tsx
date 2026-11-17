import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { colors } from '../lib/ui';

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export default function GoogleButton({ onToken }: { onToken: (idToken: string) => Promise<void> }) {
  const holder = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!CLIENT_ID) return;
    const init = () => {
      const g = (window as any).google;
      if (!g?.accounts?.id || !holder.current) return;
      g.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (r: any) => {
          setErr('');
          try { await cb.current(r.credential); } catch (e: any) { setErr(e?.message ?? 'Google sign-in failed'); }
        },
      });
      g.accounts.id.renderButton(holder.current, { theme: 'filled_black', size: 'large', width: 280 });
    };
    if ((window as any).google?.accounts?.id) init();
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
      <div ref={holder} style={{ display: 'flex', justifyContent: 'center' }} />
      {!!err && <Text style={{ color: colors.error }}>{err}</Text>}
    </View>
  );
}
