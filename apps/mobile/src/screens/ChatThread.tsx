import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

type Msg = { id: string; senderId: string; text: string; createdAt: string; readAt: string | null };

const POLL_MS = 3000;

export default function ChatThread({ friendshipId, user, meId, onBack }: {
  friendshipId: string; user: { id: string; name: string }; meId: string; onBack: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const [confirmBlock, setConfirmBlock] = useState(false);
  const listRef = useRef<any>(null);
  const lastAt = useRef<string | null>(null);

  const merge = useCallback((incoming: Msg[]) => {
    if (incoming.length === 0) return;
    setMsgs((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    lastAt.current = incoming[incoming.length - 1].createdAt;
  }, []);

  const markRead = useCallback(() => {
    api(`/chat/${friendshipId}/read`, { method: 'POST' }).catch(() => {});
  }, [friendshipId]);

  // First load
  useEffect(() => {
    api(`/chat/${friendshipId}/messages`)
      .then((r) => { merge(r.items); setErr(''); markRead(); })
      .catch((e) => setErr(e.message));
  }, [friendshipId, merge, markRead]);

  // Poll for new messages while this screen is open
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const q = lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : '';
        const r = await api(`/chat/${friendshipId}/messages${q}`);
        const before = lastAt.current;
        merge(r.items);
        if (r.items.some((m: Msg) => m.senderId !== meId) && lastAt.current !== before) markRead();
        setErr('');
      } catch (e: any) { setErr(e.message); }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [friendshipId, meId, merge, markRead]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft(''); setErr('');
    try {
      const m = await api(`/chat/${friendshipId}/messages`, { method: 'POST', body: { text } });
      merge([m]);
    } catch (e: any) { setErr(e.message); setDraft(text); }
  };

  const block = async () => {
    try {
      await api('/friends/block', { method: 'POST', body: { userId: user.id } });
      onBack();
    } catch (e: any) { setErr(e.message); setConfirmBlock(false); }
  };

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <Pressable onPress={onBack}><Text style={s.link}>‹ Back</Text></Pressable>
        <Text style={s.title} numberOfLines={1}>{user.name}</Text>
        <Pressable onPress={() => setConfirmBlock(true)}><Text style={s.muted}>Block</Text></Pressable>
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

      <ScrollView
        ref={listRef}
        style={s.list}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      >
        {msgs.length === 0 && <Text style={s.muted}>No messages yet. Say hi!</Text>}
        {msgs.map((m) => {
          const mine = m.senderId === meId;
          return (
            <View key={m.id} style={[s.bubble, mine ? s.mine : s.theirs]}>
              <Text style={s.text}>{m.text}</Text>
              <Text style={s.time}>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          );
        })}
      </ScrollView>

      {!!err && <Text style={s.err}>{err}</Text>}

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          placeholder="Message"
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          maxLength={500}
        />
        <View style={{ width: 80 }}><Btn label="Send" onPress={send} disabled={!draft.trim()} /></View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, gap: 8 },
  title: { color: colors.text, fontWeight: '800', fontSize: 18, flex: 1, textAlign: 'center' },
  link: { color: colors.peach, fontWeight: '700' },
  list: { flex: 1 },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#5a2f3a' },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card },
  text: { color: colors.text },
  time: { color: colors.muted, fontSize: 10, alignSelf: 'flex-end' },
  panel: { backgroundColor: colors.card, margin: 12, borderRadius: 10, padding: 12, gap: 10 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12 },
  input: { flex: 1, backgroundColor: colors.card, color: colors.text, padding: 12, borderRadius: 10 },
  muted: { color: colors.muted },
  err: { color: colors.error, paddingHorizontal: 12 },
});
