import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import VideoRoom from '../components/VideoRoom';
import GiftOverlay, { GiftEvent } from '../components/GiftOverlay';
import Btn from '../components/Btn';
import FriendButton from '../components/FriendButton';
import { api } from '../lib/api';
import { useKeepAwake } from 'expo-keep-awake';
import { colors } from '../lib/ui';

type FeedItem = {
  id: number; kind: 'chat' | 'gift' | 'system'; text: string;
  userId?: string; name?: string; messageId?: string;
};

const REASONS: [string, string][] = [
  ['SPAM', 'Spam'], ['HARASSMENT', 'Harassment'], ['UNDERAGE', 'Underage'],
  ['NONCONSENSUAL', 'Non-consensual'], ['ILLEGAL', 'Illegal'], ['OTHER', 'Other'],
];
const SLOW_OPTIONS: [number, string][] = [[0, 'Off'], [5, '5s'], [15, '15s'], [30, '30s']];

export default function RoomScreen({ session, me, onLeave }: {
  session: any; me: any; onLeave: () => void;
}) {
  const isHost: boolean = session.publish;
  useKeepAwake();
  const streamId: string = session.stream.id;
  const seq = useRef(0);
  const leaving = useRef(false);
  const listRef = useRef<any>(null);

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [effects, setEffects] = useState<GiftEvent[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [coins, setCoins] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const [slow, setSlow] = useState<number>(session.stream.slowModeSeconds ?? 0);
  const [muted, setMuted] = useState<boolean>(!!session.muted);
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const [reporting, setReporting] = useState(false);
  const [following, setFollowing] = useState<boolean>(!!session.creator?.isFollowing);

  const push = (item: Omit<FeedItem, 'id'>) =>
    setFeed((f) => [...f.slice(-60), { ...item, id: ++seq.current }]);

  useEffect(() => {
    if (isHost) return;
    api('/gifts').then(setGifts).catch((e) => setErr(e.message));
    api('/wallet').then((w) => setCoins(w.coinBalance)).catch(() => {});
  }, [isHost]);

  const onMessage = (m: any) => {
    if (m.type === 'chat') {
      push({ kind: 'chat', text: `${m.host ? '👑 ' : ''}${m.from}: ${m.text}`, userId: m.userId, name: m.from, messageId: m.id });
    } else if (m.type === 'gift') {
      push({ kind: 'gift', text: `🎁 ${m.from} sent ${m.gift}` });
      setEffects((e) => [...e.slice(-5), {
        id: ++seq.current, from: String(m.from), gift: String(m.gift), emoji: String(m.emoji || '🎁'), coins: Number(m.coins) || 0,
      }]);
    } else if (m.type === 'slow') {
      setSlow(m.seconds);
      push({ kind: 'system', text: m.seconds ? `Slow mode: 1 message per ${m.seconds}s` : 'Slow mode is off' });
    } else if (m.type === 'muted' && m.userId === me.id) {
      setMuted(true);
      push({ kind: 'system', text: 'You were muted by the host' });
    } else if (m.type === 'unmuted' && m.userId === me.id) {
      setMuted(false);
      push({ kind: 'system', text: 'You can chat again' });
    }
  };

  const onDisconnected = () => {
    if (leaving.current) return;
    leaving.current = true;
    setErr('Disconnected: the stream ended or you were removed.');
    setTimeout(onLeave, 1800);
  };

  const sendGift = async (g: any) => {
    setErr('');
    try {
      const r = await api('/gifts/send', {
        method: 'POST',
        body: { streamId, giftId: g.id, idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` },
      });
      setCoins(r.coinBalance); // the animation arrives from the server broadcast
    } catch (e: any) { setErr(e.message); }
  };

  const sendChat = async () => {
    const text = draft.trim();
    if (!text || muted) return;
    setDraft(''); setErr('');
    try {
      await api(`/streams/${streamId}/chat`, { method: 'POST', body: { text } });
    } catch (e: any) {
      setErr(e.message); setDraft(text);
      if (/muted/i.test(e.message)) setMuted(true);
    }
  };

  const modAction = async (path: 'mute' | 'unmute' | 'kick') => {
    if (!selected?.userId) return;
    setErr('');
    try {
      await api(`/streams/${streamId}/${path}`, { method: 'POST', body: { userId: selected.userId } });
      push({ kind: 'system', text: `${path === 'kick' ? 'Removed' : path === 'mute' ? 'Muted' : 'Unmuted'} ${selected.name}` });
      setSelected(null);
    } catch (e: any) { setErr(e.message); }
  };

  const setSlowMode = async (seconds: number) => {
    setErr('');
    try { await api(`/streams/${streamId}/slow-mode`, { method: 'POST', body: { seconds } }); }
    catch (e: any) { setErr(e.message); }
  };

  const sendReport = async (reason: string) => {
    if (!selected?.userId) return;
    try {
      await api('/reports', {
        method: 'POST',
        body: { targetUserId: selected.userId, streamId, messageId: selected.messageId, reason },
      });
      push({ kind: 'system', text: 'Report sent. Thank you.' });
    } catch (e: any) { setErr(e.message); }
    setReporting(false); setSelected(null);
  };

  const toggleFollow = async () => {
    const u = session.creator?.username;
    if (!u) return;
    const next = !following;
    setFollowing(next);
    try { await api(`/creators/${encodeURIComponent(u)}/${next ? 'follow' : 'unfollow'}`, { method: 'POST' }); }
    catch (e: any) { setFollowing(!next); setErr(e.message); }
  };

  const leave = async () => {
    leaving.current = true;
    if (isHost) {
      try { await api(`/streams/${streamId}/end`, { method: 'POST' }); } catch {}
    }
    onLeave();
  };

  const canActOn = selected && selected.userId && selected.userId !== me.id;

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>{session.stream.title} {isHost ? '(you are live)' : ''}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {!isHost && !!session.creator?.username && (
            <Pressable onPress={toggleFollow}><Text style={s.leave}>{following ? '❤ Following' : '♡ Follow'}</Text></Pressable>
          )}
          {!isHost && !!session.creator?.id && <FriendButton userId={session.creator.id} compact />}
          <Pressable onPress={leave}><Text style={s.leave}>{isHost ? 'End' : 'Leave'}</Text></Pressable>
        </View>
      </View>

      <View style={s.video}>
        <VideoRoom
          url={session.livekitUrl}
          token={session.token}
          publish={isHost}
          onMessage={onMessage}
          onDisconnected={onDisconnected}
        />
        <GiftOverlay events={effects} onDone={(id) => setEffects((e) => e.filter((x) => x.id !== id))} />
      </View>

      {isHost && (
        <View style={s.rowWrap}>
          <Text style={s.muted}>Slow mode:</Text>
          {SLOW_OPTIONS.map(([sec, label]) => (
            <Pressable key={sec} onPress={() => setSlowMode(sec)} style={[s.chip, slow === sec && s.chipOn]}>
              <Text style={[s.chipText, slow === sec && { color: '#fff' }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {!isHost && slow > 0 && <Text style={s.muted}>Slow mode: 1 message per {slow}s</Text>}

      <ScrollView
        ref={listRef}
        style={s.chat}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      >
        {feed.map((f) => (
          <Pressable
            key={f.id}
            disabled={f.kind !== 'chat'}
            onPress={() => { setSelected(f); setReporting(false); }}
          >
            <Text style={[s.line, f.kind === 'gift' && s.gift, f.kind === 'system' && s.system]}>{f.text}</Text>
          </Pressable>
        ))}
        {feed.length === 0 && <Text style={s.muted}>No messages yet. Tap a message to moderate, report or add friend.</Text>}
      </ScrollView>

      {canActOn && (
        <View style={s.panel}>
          <Text style={s.panelTitle}>{selected!.name}</Text>
          {!reporting ? (
            <View style={s.rowWrap}>
              {isHost && (
                <>
                  <View style={s.cell}><Btn label="Mute" onPress={() => modAction('mute')} outline /></View>
                  <View style={s.cell}><Btn label="Unmute" onPress={() => modAction('unmute')} outline /></View>
                  <View style={s.cell}><Btn label="Kick" onPress={() => modAction('kick')} outline /></View>
                </>
              )}
              <View style={s.cell}><FriendButton key={selected!.userId} userId={selected!.userId} compact /></View>
              <View style={s.cell}><Btn label="Report" onPress={() => setReporting(true)} outline /></View>
              <View style={s.cell}><Btn label="Close" onPress={() => setSelected(null)} outline /></View>
            </View>
          ) : (
            <View style={s.rowWrap}>
              {REASONS.map(([val, label]) => (
                <View key={val} style={s.cell}><Btn label={label} onPress={() => sendReport(val)} outline /></View>
              ))}
              <View style={s.cell}><Btn label="Cancel" onPress={() => setReporting(false)} outline /></View>
            </View>
          )}
        </View>
      )}

      <View style={s.chatRow}>
        <TextInput
          style={s.input}
          placeholder={muted ? 'You are muted' : 'Say something...'}
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={sendChat}
          editable={!muted}
          maxLength={200}
        />
        <View style={{ width: 80 }}><Btn label="Send" onPress={sendChat} disabled={!draft.trim() || muted} /></View>
      </View>

      {!!err && <Text style={s.err}>{err}</Text>}

      {!isHost && (
        <View style={{ gap: 8 }}>
          <Text style={s.muted}>Your coins: {coins ?? '...'}</Text>
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {gifts.map((g) => (
              <View key={g.id} style={{ width: 150 }}>
                <Btn label={`${g.emoji ?? '🎁'} ${g.name} · ${g.coinPrice}`} onPress={() => sendGift(g)} />
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: 12, gap: 8, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontWeight: '700', fontSize: 16, flex: 1 },
  leave: { color: colors.peach, fontWeight: '700' },
 video: { flex: 1, minHeight: 160, maxHeight: 360, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
chat: { flexGrow: 0, flexShrink: 1, minHeight: 80, maxHeight: 150, backgroundColor: colors.card, borderRadius: 10, padding: 8 },
  line: { color: colors.text, paddingVertical: 2 },
  gift: { color: colors.peach, fontWeight: '700' },
  system: { color: colors.muted, fontStyle: 'italic' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  cell: { minWidth: 100 },
  chip: { borderWidth: 1, borderColor: colors.peach, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  chipOn: { backgroundColor: colors.peach },
  chipText: { color: colors.peach, fontWeight: '700' },
  panel: { backgroundColor: colors.card, borderRadius: 10, padding: 10, gap: 8 },
  panelTitle: { color: colors.text, fontWeight: '700' },
  chatRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, backgroundColor: colors.card, color: colors.text, padding: 12, borderRadius: 10 },
  muted: { color: colors.muted },
  err: { color: colors.error },
});
