import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import Btn from '../components/Btn';
import Avatar from '../components/Avatar';
import { api } from '../lib/api';
import { colors } from '../lib/ui';
import { usePolling } from '../lib/usePolling';

type Msg = {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  readAt: string | null;
  state?: 'sending' | 'failed';
};

// Opening a conversation again is instant: the last messages are kept in memory.
const threadCache = new Map<string, Msg[]>();

const GROUP_MS = 3 * 60 * 1000;

const dayKey = (iso: string) => new Date(iso).toDateString();

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yest = new Date();
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function ChatThread({ friendshipId, user, meId, onBack }: {
  friendshipId: string; user: { id: string; name: string; avatarUrl?: string | null }; meId: string; onBack: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(threadCache.get(friendshipId) ?? []);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [unseen, setUnseen] = useState(0);

  const listRef = useRef<any>(null);
  const lastAt = useRef<string | null>(null);
  const nearBottom = useRef(true);
  const tick = useRef(0);

  const keep = (next: Msg[]) => {
    threadCache.set(friendshipId, next.filter((m) => !m.state).slice(-80));
    return next;
  };

  const scrollEnd = (animated = true) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  };

  // Adds new messages. With update=true, messages already shown get their latest read status.
  const merge = useCallback((incoming: Msg[], update = false) => {
    if (incoming.length === 0) return;
    let added = 0;
    let fromThem = 0;
    setMsgs((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      let changed = false;
      for (const m of incoming) {
        const old = byId.get(m.id);
        if (!old) {
          byId.set(m.id, m);
          added++;
          if (m.senderId !== meId) fromThem++;
          changed = true;
        } else if (update && old.readAt !== m.readAt) {
          byId.set(m.id, { ...old, readAt: m.readAt });
          changed = true;
        }
      }
      if (!changed) return prev;
      const merged = Array.from(byId.values()).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      return keep(merged);
    });
    const real = incoming[incoming.length - 1];
    if (real && (!lastAt.current || +new Date(real.createdAt) > +new Date(lastAt.current))) lastAt.current = real.createdAt;
    if (added > 0) {
      if (nearBottom.current) scrollEnd();
      else if (fromThem > 0) setUnseen((n) => n + fromThem);
    }
  }, [friendshipId, meId]); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = useCallback(() => {
    api(`/chat/${friendshipId}/read`, { method: 'POST' }).catch(() => {});
  }, [friendshipId]);

  // First load
  useEffect(() => {
    api(`/chat/${friendshipId}/messages`)
      .then((r) => { merge(r.items, true); setErr(''); markRead(); scrollEnd(false); })
      .catch((e) => setErr(e.message));
  }, [friendshipId, merge, markRead]);

  // Poll for new messages while this screen is open (foreground only).
  usePolling(async () => {
    tick.current++;
    try {
      const full = tick.current % 5 === 0; // every few rounds also refresh read ticks
      const q = !full && lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : '';
      const r = await api(`/chat/${friendshipId}/messages${q}`);
      const before = lastAt.current;
      merge(r.items, full);
      if (r.items.some((m: Msg) => m.senderId !== meId) && lastAt.current !== before) markRead();
      setErr('');
    } catch (e: any) { setErr(e.message); }
  }, 3000, [friendshipId, meId]);

  const sendText = async (text: string, tmpId: string) => {
    try {
      const m = await api(`/chat/${friendshipId}/messages`, { method: 'POST', body: { text } });
      setMsgs((prev) => keep(prev.filter((x) => x.id !== tmpId && x.id !== m.id).concat(m)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))));
      lastAt.current = m.createdAt;
      setErr('');
    } catch (e: any) {
      setMsgs((prev) => prev.map((x) => (x.id === tmpId ? { ...x, state: 'failed' as const } : x)));
      setErr(e.message);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setErr('');
    const tmpId = `tmp-${Date.now()}`;
    setMsgs((prev) => [...prev, { id: tmpId, senderId: meId, text, createdAt: new Date().toISOString(), readAt: null, state: 'sending' }]);
    nearBottom.current = true;
    scrollEnd();
    sendText(text, tmpId);
  };

  const retry = (m: Msg) => {
    setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, state: 'sending' as const } : x)));
    sendText(m.text, m.id);
  };

  const block = async () => {
    try {
      await api('/friends/block', { method: 'POST', body: { userId: user.id } });
      onBack();
    } catch (e: any) { setErr(e.message); setConfirmBlock(false); }
  };

  const onScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const near = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80;
    nearBottom.current = near;
    if (near && unseen) setUnseen(0);
  };

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={s.back}>‹</Text>
        </Pressable>
        <Avatar name={user.name} uri={user.avatarUrl} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{user.name}</Text>
          <Text style={s.sub}>Friends</Text>
        </View>
        <Pressable onPress={() => setConfirmBlock(true)} hitSlop={10} accessibilityRole="button">
          <Text style={s.muted}>Block</Text>
        </Pressable>
      </View>

      {confirmBlock && (
        <View style={s.panel}>
          <Text style={s.text}>Block {user.name}? You will no longer be friends and cannot message each other.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Btn label="Block" onPress={block} /></View>
            <View style={{ flex: 1 }}><Btn label="Cancel" onPress={() => setConfirmBlock(false)} outline /></View>
          </View>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <ScrollView
          ref={listRef}
          style={s.list}
          contentContainerStyle={{ padding: 12, paddingBottom: 6 }}
          onScroll={onScroll}
          scrollEventThrottle={100}
          keyboardShouldPersistTaps="handled"
        >
          {msgs.length === 0 && (
            <View style={s.empty}>
              <Avatar name={user.name} uri={user.avatarUrl} size={64} />
              <Text style={s.emptyTitle}>Say hi to {user.name}</Text>
              <Text style={s.muted}>Messages are text only for now.</Text>
            </View>
          )}

          {msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const next = msgs[i + 1];
            const mine = m.senderId === meId;
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
            const joinsPrev = !!prev && !newDay && prev.senderId === m.senderId && +new Date(m.createdAt) - +new Date(prev.createdAt) < GROUP_MS;
            const joinsNext = !!next && dayKey(next.createdAt) === dayKey(m.createdAt) && next.senderId === m.senderId && +new Date(next.createdAt) - +new Date(m.createdAt) < GROUP_MS;
            return (
              <View key={m.id}>
                {newDay && (
                  <View style={s.dayRow}><Text style={s.dayText}>{dayLabel(m.createdAt)}</Text></View>
                )}
                <View style={{ marginTop: joinsPrev ? 2 : 8, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  <Pressable
                    disabled={m.state !== 'failed'}
                    onPress={() => retry(m)}
                    style={[
                      s.bubble,
                      mine ? s.mine : s.theirs,
                      mine && joinsPrev && { borderTopRightRadius: 6 },
                      !mine && joinsPrev && { borderTopLeftRadius: 6 },
                      mine && joinsNext && { borderBottomRightRadius: 6 },
                      !mine && joinsNext && { borderBottomLeftRadius: 6 },
                      m.state === 'sending' && { opacity: 0.6 },
                      m.state === 'failed' && s.failed,
                    ]}
                  >
                    <Text style={s.text}>{m.text}</Text>
                  </Pressable>
                  {m.state === 'failed' ? (
                    <Text style={s.failText}>Not sent. Tap to retry</Text>
                  ) : !joinsNext ? (
                    <Text style={s.time}>
                      {m.state === 'sending' ? 'Sending...' : clock(m.createdAt)}
                      {mine && !m.state ? (m.readAt ? '  ✓✓' : '  ✓') : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {unseen > 0 && (
          <Pressable
            style={s.chip}
            onPress={() => { setUnseen(0); nearBottom.current = true; scrollEnd(); }}
            accessibilityRole="button"
          >
            <Text style={s.chipText}>{unseen} new message{unseen === 1 ? '' : 's'} ↓</Text>
          </Pressable>
        )}
      </View>

      {!!err && <Text style={s.err} numberOfLines={2}>{err}</Text>}

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          placeholder="Message"
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          blurOnSubmit={false}
          maxLength={500}
          accessibilityLabel="Message"
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim()}
          style={[s.send, !draft.trim() && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Text style={s.sendText}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10,
    borderBottomWidth: 1, borderBottomColor: '#2c2438',
  },
  back: { color: colors.peach, fontSize: 34, lineHeight: 34, fontWeight: '300', paddingRight: 4 },
  title: { color: colors.text, fontWeight: '800', fontSize: 17 },
  sub: { color: colors.muted, fontSize: 12 },
  list: { flex: 1 },
  dayRow: { alignItems: 'center', marginTop: 12, marginBottom: 4 },
  dayText: { color: colors.muted, fontSize: 12, backgroundColor: colors.card, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingVertical: 9, paddingHorizontal: 13 },
  mine: { backgroundColor: colors.peach },
  theirs: { backgroundColor: colors.card },
  failed: { backgroundColor: '#5a2f3a' },
  text: { color: colors.text, fontSize: 15 },
  time: { color: colors.muted, fontSize: 11, marginTop: 3, marginHorizontal: 4 },
  failText: { color: colors.error, fontSize: 11, marginTop: 3, marginHorizontal: 4 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  panel: { backgroundColor: colors.card, margin: 12, borderRadius: 12, padding: 12, gap: 10 },
  chip: { position: 'absolute', bottom: 8, alignSelf: 'center', backgroundColor: colors.peach, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10 },
  input: { flex: 1, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 16, height: 44, borderRadius: 22, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  muted: { color: colors.muted },
  err: { color: colors.error, paddingHorizontal: 14, fontSize: 12 },
});
