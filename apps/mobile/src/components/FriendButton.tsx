import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import Btn from './Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

// Add-friend control for creator profiles and live streams.
// Pass either userId (stream host, chat message author) or username (creator profile).
export default function FriendButton({ userId, username, compact }: {
  userId?: string; username?: string; compact?: boolean;
}) {
  const [st, setSt] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const who = userId ? { userId } : { username };
  const qs = userId ? `userId=${encodeURIComponent(userId)}` : `username=${encodeURIComponent(username ?? '')}`;

  const load = useCallback(async () => {
    try { setSt(await api(`/friends/status?${qs}`)); setErr(''); } catch (e: any) { setErr(e.message); }
  }, [qs]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!st || st.status === 'SELF') return null;
  if (st.status === 'BLOCKED' && !st.byMe) return null;

  let label = 'Add friend';
  let onPress: () => void = () => run(() => api('/friends/request', { method: 'POST', body: who }));
  let outline = false;
  let disabled = busy;

  switch (st.status) {
    case 'OUTGOING':
      label = compact ? 'Requested' : 'Request sent · tap to cancel'; outline = true;
      onPress = () => run(() => api(`/friends/${st.friendshipId}/remove`, { method: 'POST' }));
      break;
    case 'INCOMING':
      label = compact ? 'Accept' : 'Accept friend request';
      onPress = () => run(() => api(`/friends/${st.friendshipId}/accept`, { method: 'POST' }));
      break;
    case 'FRIENDS':
      label = 'Friends ✓'; outline = true; disabled = true; onPress = () => {};
      break;
    case 'BLOCKED':
      label = 'Unblock'; outline = true;
      onPress = () => run(() => api('/friends/unblock', { method: 'POST', body: { userId: st.userId } }));
      break;
  }

  if (compact) {
    return (
      <View>
        <Pressable onPress={onPress} disabled={disabled} style={[s.chip, outline && s.chipOutline, disabled && { opacity: 0.6 }]}>
          <Text style={[s.chipText, !outline && { color: '#fff' }]}>{label}</Text>
        </Pressable>
        {!!err && <Text style={s.err}>{err}</Text>}
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Btn label={label} onPress={onPress} disabled={disabled} outline={outline} />
      {!!err && <Text style={s.err}>{err}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  chip: { backgroundColor: colors.peach, borderWidth: 1, borderColor: colors.peach, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  chipOutline: { backgroundColor: 'transparent' },
  chipText: { color: colors.peach, fontWeight: '700' },
  err: { color: colors.error, fontSize: 12, marginTop: 2 },
});
