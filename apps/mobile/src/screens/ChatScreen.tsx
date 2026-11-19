import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import ChatThread from './ChatThread';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const POLL_MS = 5000;

// Chat tab: friend requests + conversations. Opening a conversation shows the thread in place.
export default function ChatScreen({ meId, openFriendshipId, onOpened }: {
  meId: string; openFriendshipId?: string | null; onOpened?: () => void;
}) {
  const [convos, setConvos] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [open, setOpen] = useState<{ friendshipId: string; user: any } | null>(null);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([api('/chat/conversations'), api('/friends/requests')]);
      setConvos(c); setRequests(r); setErr('');
    } catch (e: any) { setErr(e.message); } finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    if (open) return; // the thread polls on its own
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, open]);

  // Tapping a chat notification opens that conversation once the list is loaded.
  useEffect(() => {
    if (!openFriendshipId || open) return;
    const c = convos.find((x) => x.friendshipId === openFriendshipId);
    if (c) { setOpen({ friendshipId: c.friendshipId, user: c.user }); onOpened?.(); }
  }, [openFriendshipId, convos, open, onOpened]);

  const respond = async (id: string, action: 'accept' | 'decline') => {
    try { await api(`/friends/${id}/${action}`, { method: 'POST' }); await load(); }
    catch (e: any) { setErr(e.message); }
  };

  if (open) {
    return (
      <ChatThread
        friendshipId={open.friendshipId}
        user={open.user}
        meId={meId}
        onBack={() => { setOpen(null); load(); }}
      />
    );
  }

  const header = (
    <View style={{ gap: 12 }}>
      <Text style={s.title}>Chat</Text>
      {!!err && <Text style={s.err}>{err}</Text>}
      {requests.length > 0 && (
        <>
          <Text style={s.section}>Friend requests</Text>
          {requests.map((r) => (
            <View key={r.friendshipId} style={s.card}>
              <Text style={s.name}>{r.user.name}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Btn label="Accept" onPress={() => respond(r.friendshipId, 'accept')} /></View>
                <View style={{ flex: 1 }}><Btn label="Decline" onPress={() => respond(r.friendshipId, 'decline')} outline /></View>
              </View>
            </View>
          ))}
        </>
      )}
      <Text style={s.section}>Friends</Text>
    </View>
  );

  return (
    <FlatList
      style={s.wrap}
      contentContainerStyle={{ padding: 16, gap: 8, maxWidth: 520, width: '100%', alignSelf: 'center' }}
      data={convos}
      keyExtractor={(i) => i.friendshipId}
      ListHeaderComponent={header}
      ListEmptyComponent={
        loaded ? (
          <Text style={s.muted}>
            No friends yet. Open a creator's profile or a live stream and tap Add friend. Chat opens once they accept.
          </Text>
        ) : undefined
      }
      renderItem={({ item }) => (
        <Pressable style={s.row} onPress={() => setOpen({ friendshipId: item.friendshipId, user: item.user })}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.name}>{item.user.name}</Text>
            <Text style={s.muted} numberOfLines={1}>
              {item.lastMessage ? `${item.lastMessage.mine ? 'You: ' : ''}${item.lastMessage.text}` : 'Say hi!'}
            </Text>
          </View>
          {item.unread > 0 && (
            <View style={s.badge}><Text style={s.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text></View>
          )}
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  section: { color: colors.text, fontWeight: '700', fontSize: 18, marginTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 10 },
  row: { backgroundColor: colors.card, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.muted },
  badge: { backgroundColor: colors.peach, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  err: { color: colors.error },
});
