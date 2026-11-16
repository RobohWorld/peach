import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import VideoRoom from '../components/VideoRoom';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

export default function RoomScreen({ session, me, onLeave }: {
  session: any; me: any; onLeave: () => void;
}) {
  const isHost: boolean = session.publish;
  const sender = useRef<(m: any) => void>(() => {});
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [coins, setCoins] = useState<number | null>(null);
  const [err, setErr] = useState('');

  const toast = (text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-4), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  };

  useEffect(() => {
    if (isHost) return;
    api('/gifts').then(setGifts).catch((e) => setErr(e.message));
    api('/wallet').then((w) => setCoins(w.coinBalance)).catch(() => {});
  }, [isHost]);

  const sendGift = async (g: any) => {
    setErr('');
    try {
      const r = await api('/gifts/send', {
        method: 'POST',
        body: {
          streamId: session.stream.id,
          giftId: g.id,
          idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        },
      });
      setCoins(r.coinBalance);
      sender.current({ type: 'gift', from: me.name, gift: g.name });
      toast(`You sent ${g.name}`);
    } catch (e: any) { setErr(e.message); }
  };

  const leave = async () => {
    if (isHost) {
      try { await api(`/streams/${session.stream.id}/end`, { method: 'POST' }); } catch {}
    }
    onLeave();
  };

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>{session.stream.title} {isHost ? '(you are live)' : ''}</Text>
        <Pressable onPress={leave}><Text style={s.leave}>{isHost ? 'End' : 'Leave'}</Text></Pressable>
      </View>

      <View style={s.video}>
        <VideoRoom
          url={session.livekitUrl}
          token={session.token}
          publish={isHost}
          onMessage={(m) => { if (m?.type === 'gift') toast(`🎁 ${m.from} sent ${m.gift}`); }}
          registerSender={(fn) => { sender.current = fn; }}
        />
        <View style={s.toasts} pointerEvents="none">
          {toasts.map((t) => <Text key={t.id} style={s.toast}>{t.text}</Text>)}
        </View>
      </View>

      {!!err && <Text style={s.err}>{err}</Text>}

      {!isHost && (
        <View style={{ gap: 8 }}>
          <Text style={s.muted}>Your coins: {coins ?? '...'}</Text>
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {gifts.map((g) => (
              <View key={g.id} style={{ width: 140 }}>
                <Btn label={`${g.name} · ${g.coinPrice}`} onPress={() => sendGift(g)} />
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 12, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontWeight: '700', fontSize: 16, flex: 1 },
  leave: { color: colors.peach, fontWeight: '700' },
  video: { height: 420, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  toasts: { position: 'absolute', left: 10, bottom: 10, gap: 4 },
  toast: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  muted: { color: colors.muted },
  err: { color: colors.error },
});
