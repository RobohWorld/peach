import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, RefreshControl } from 'react-native';
import Btn from '../components/Btn';
import Avatar from '../components/Avatar';
import ChatThread from './ChatThread';
import { api } from '../lib/api';
import { colors } from '../lib/ui';
import { useCachedQuery } from '../lib/cache';

function ago(iso?: string) {
  if (!iso) return '';
  const diff = Date.now() - +new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// Chat tab: friend requests + conversations. Opening a conversation shows the thread in place.
export default function ChatScreen({ meId, openFriendshipId, onOpened }: {
  meId: string; openFriendshipId?: string | null; onOpened?: () => void;
}) {
  const [open, setOpen] = useState<{ friendshipId: string; user: any } | null>(null);
  const [err, setErr] = useState('');

  // Saved lists show instantly; the server is checked every 5s only while this list is on screen.
  const convosQ = useCachedQuery<any[]>('/chat/conversations', { staleMs: 3_000, pollMs: 5_000, enabled: !open });
  const requestsQ = useCachedQuery<any[]>('/friends/requests', { staleMs: 3_000, pollMs: 5_000, enabled: !open });

  const convos = convosQ.data ?? [];
  const requests = requestsQ.data ?? [];
  const loaded = convosQ.loaded;

  // Tapping a chat notification opens that conversation once the list is loaded.
  useEffect(() => {
    if (!openFriendshipId || open) return;
    const c = convos.find((x) => x.friendshipId === openFriendshipId);
    if (c) { setOpen({ friendshipId: c.friendshipId, user: c.user }); onOpened?.(); }
  }, [openFriendshipId, convos, open, onOpened]);

  const reload = async () => {
    await Promise.all([convosQ.refresh(), requestsQ.refresh()]);
  };

  const respond = async (id: string, action: 'accept' | 'decline') => {
    try { await api(`/friends/${id}/${action}`, { method: 'POST' }); setErr(''); await reload(); }
    catch (e: any) { setErr(e.message); }
  };

  if (open) {
    return (
      <ChatThread
        friendshipId={open.friendshipId}
        user={open.user}
        meId={meId}
        onBack={() => { setOpen(null); reload(); }}
      />
    );
  }

  const header = (
    <View style={{ gap: 12 }}>
      <Text style={s.title}>Messages</Text>
      {!!(err || (loaded && convos.length === 0 ? convosQ.error : '')) && (
        <Text style={s.err}>{err || convosQ.error}</Text>
      )}
      {requests.length > 0 && (
        <>
          <Text style={s.section}>Friend requests</Text>
          {requests.map((r) => (
            <View key={r.friendshipId} style={s.card}>
              <View style={s.rowTop}>
                <Avatar name={r.user.name} uri={r.user.avatarUrl} size={44} />
                <Text style={[s.name, { flex: 1 }]} numberOfLines={1}>{r.user.name}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Btn label="Accept" onPress={() => respond(r.friendshipId, 'accept')} /></View>
                <View style={{ flex: 1 }}><Btn label="Decline" onPress={() => respond(r.friendshipId, 'decline')} outline /></View>
              </View>
            </View>
          ))}
        </>
      )}
      {convos.length > 0 && <Text style={s.section}>Friends</Text>}
    </View>
  );

  return (
    <FlatList
      style={s.wrap}
      contentContainerStyle={{ padding: 16, gap: 8, maxWidth: 520, width: '100%', alignSelf: 'center' }}
      data={convos}
      keyExtractor={(i) => i.friendshipId}
      ListHeaderComponent={header}
      refreshControl={
        <RefreshControl
          refreshing={convosQ.refreshing}
          onRefresh={reload}
          tintColor={colors.peach}
          colors={[colors.peach]}
        />
      }
      ListEmptyComponent={
        loaded ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>💬</Text>
            <Text style={s.emptyTitle}>No friends yet</Text>
            <Text style={s.muted}>
              Open a creator's profile or a live stream and tap Add friend. Chat opens once they accept.
            </Text>
          </View>
        ) : undefined
      }
      renderItem={({ item }) => {
        const unread = Number(item.unread) || 0;
        return (
          <Pressable
            style={s.row}
            onPress={() => setOpen({ friendshipId: item.friendshipId, user: item.user })}
            accessibilityRole="button"
            accessibilityLabel={`Chat with ${item.user.name}${unread ? `, ${unread} unread` : ''}`}
          >
            <Avatar name={item.user.name} uri={item.user.avatarUrl} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={s.rowTop}>
                <Text style={[s.name, { flex: 1 }]} numberOfLines={1}>{item.user.name}</Text>
                {!!item.lastMessage?.createdAt && (
                  <Text style={[s.when, unread > 0 && { color: colors.peach }]}>{ago(item.lastMessage.createdAt)}</Text>
                )}
              </View>
              <Text style={[s.preview, unread > 0 && s.previewUnread]} numberOfLines={1}>
                {item.lastMessage ? `${item.lastMessage.mine ? 'You: ' : ''}${item.lastMessage.text}` : 'Say hi!'}
              </Text>
            </View>
            {unread > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>
            )}
          </Pressable>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  section: { color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 6 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 10 },
  row: { backgroundColor: colors.card, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  when: { color: colors.muted, fontSize: 12 },
  preview: { color: colors.muted },
  previewUnread: { color: colors.text, fontWeight: '700' },
  muted: { color: colors.muted, textAlign: 'center' },
  badge: { backgroundColor: colors.peach, borderRadius: 11, minWidth: 22, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center' },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  err: { color: colors.error },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 36, paddingHorizontal: 12 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 17 },
});
