import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Image, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import FriendButton from '../components/FriendButton';
import CreatorMedia from '../components/CreatorMedia';
import SubscribePanel from '../components/SubscribePanel';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

export default function ProfileScreen({ username, onBack, onWatch }: {
  username: string; onBack: () => void; onWatch: (streamId: string) => void;
}) {
  const [p, setP] = useState<any>(null);
  const [bio, setBio] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api(`/creators/${encodeURIComponent(username)}`);
      setP(r); setBio(r.bio ?? ''); setErr('');
    } catch (e: any) { setErr(e.message); }
  }, [username]);
  useEffect(() => { load(); }, [load]);

  const toggleFollow = async () => {
    if (!p) return;
    setBusy(true); setErr('');
    try {
      const r = await api(`/creators/${encodeURIComponent(username)}/${p.isFollowing ? 'unfollow' : 'follow'}`, { method: 'POST' });
      setP({ ...p, isFollowing: !p.isFollowing, followers: r.followers });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const toggleMute = async () => {
  if (!p) return;
  setBusy(true); setErr('');
  try {
    const r = await api(`/creators/${encodeURIComponent(username)}/mute-live`, { method: 'POST', body: { muted: !p.muteLive } });
    setP({ ...p, muteLive: r.muteLive });
  } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
};

  const saveBio = async () => {
    setBusy(true); setErr(''); setOk('');
    try { await api('/creator/profile', { method: 'PUT', body: { bio } }); setOk('Saved'); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>Profile</Text>
        <Pressable onPress={onBack}><Text style={s.link}>Back</Text></Pressable>
      </View>

      {!!err && <Text style={s.err}>{err}</Text>}
      {!p && !err && <Text style={s.muted}>Loading...</Text>}

      {p && (
        <>
          <View style={s.card}>
            <View style={s.avatar}>
              {p.avatarUrl
                ? <Image source={{ uri: p.avatarUrl }} style={s.avatarImg} />
                : <Text style={s.avatarText}>{String(p.name ?? '?').slice(0, 1).toUpperCase()}</Text>}
            </View>
            <Text style={s.name}>{p.name}</Text>
            <Text style={s.muted}>@{p.username} · {p.followers} follower{p.followers === 1 ? '' : 's'}</Text>
            {!p.isMe && !!p.bio && <Text style={s.text}>{p.bio}</Text>}

            {!!p.live && (
              <Btn label={`🔴 Watch live: ${p.live.title}`} onPress={() => onWatch(p.live.id)} />
            )}
            {!p.isMe && (
              <Btn label={p.isFollowing ? 'Following ✓' : 'Follow'} onPress={toggleFollow} disabled={busy} outline={p.isFollowing} />
            )}

            {!p.isMe && p.isFollowing && (
  <Btn label={p.muteLive ? '🔕 Live alerts off' : '🔔 Live alerts on'} onPress={toggleMute} disabled={busy} outline />
)}
            {!p.isMe && <FriendButton username={p.username} />}
          </View>

          {p.isMe && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Your bio</Text>
              <TextInput style={[s.input, { height: 100 }]} multiline value={bio} onChangeText={setBio}
                maxLength={300} placeholder="Tell people about your streams" placeholderTextColor={colors.muted} />
              {!!ok && <Text style={s.okText}>{ok}</Text>}
              <Btn label={busy ? 'Saving...' : 'Save bio'} onPress={saveBio} disabled={busy} />
            </View>
          )}

          <SubscribePanel username={p.username} isMe={!!p.isMe} />
          <CreatorMedia username={p.username} isMe={!!p.isMe} />
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  link: { color: colors.peach, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 10, alignItems: 'stretch' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', overflow: 'hidden' },
  avatarImg: { width: 72, height: 72 },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '800' },
  name: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  cardTitle: { color: colors.text, fontWeight: '700' },
  input: { backgroundColor: colors.bg, color: colors.text, padding: 12, borderRadius: 10, textAlignVertical: 'top' },
  text: { color: colors.text, textAlign: 'center' },
  muted: { color: colors.muted, textAlign: 'center' },
  err: { color: colors.error },
  okText: { color: '#4cc38a' },
});
