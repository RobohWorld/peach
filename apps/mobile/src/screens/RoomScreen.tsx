import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';

import VideoRoom from '../components/VideoRoom';
import GiftOverlay, { GiftEvent } from '../components/GiftOverlay';
import Avatar, { bigAvatar } from '../components/Avatar';
import Btn from '../components/Btn';
import FriendButton from '../components/FriendButton';
import ReportDialog, { ReportTarget } from '../components/ReportDialog';

import { api } from '../lib/api';
import { colors } from '../lib/ui';
import { useLayout } from '../lib/useLayout';
import { tap, success } from '../lib/haptics';
import { flag, ensureCountrySynced, savedCountry } from '../lib/countries';

type FeedItem = {
  id: number;
  kind: 'chat' | 'gift' | 'system';
  text: string;
  name?: string;
  host?: boolean;
  userId?: string;
  messageId?: string;
};

type Sheet = 'none' | 'gifts' | 'tools' | 'end';

const SLOW_OPTIONS: [number, string][] = [[0, 'Off'], [5, '5s'], [15, '15s'], [30, '30s']];
const VISIBLE_LINES = 8;

export default function RoomScreen({
  session,
  me,
  onLeave,
  onOpenChat,
  onOpenProfile,
}: {
  session: any;
  me: any;
  onLeave: () => void;
  onOpenChat?: (friendshipId: string) => void;
  onOpenProfile?: (username: string) => void;
}) {
  const isHost: boolean = session.publish;
  useKeepAwake();
  const L = useLayout();
  const streamId: string = session.stream.id;

  const seq = useRef(0);
  const leaving = useRef(false);

  const creator: any = isHost
    ? {
        id: me?.id,
        name: me?.name,
        avatarUrl: me?.avatarUrl,
        username: me?.creator?.username,
        country: savedCountry(me?.id),
      }
    : session.creator ?? {};

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [effects, setEffects] = useState<GiftEvent[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [coins, setCoins] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const [slow, setSlow] = useState<number>(session.stream.slowModeSeconds ?? 0);
  const [muted, setMuted] = useState<boolean>(!!session.muted);
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [following, setFollowing] = useState<boolean>(!!session.creator?.isFollowing);
  const [sending, setSending] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [friend, setFriend] = useState<any>(null);
  const [sheet, setSheet] = useState<Sheet>('none');

  const push = (item: Omit<FeedItem, 'id'>) =>
    setFeed((f) => [...f.slice(-60), { ...item, id: ++seq.current }]);

  const refreshFriend = () => {
    if (isHost || !creator.id) return;
    api(`/friends/status?userId=${encodeURIComponent(creator.id)}`)
      .then(setFriend)
      .catch(() => {});
  };

  useEffect(() => {
    if (isHost) {
      ensureCountrySynced(me?.id);
      return;
    }
    api('/gifts').then(setGifts).catch((e) => setErr(e.message));
    api('/wallet').then((w) => setCoins(w.coinBalance)).catch(() => {});
    refreshFriend();
  }, [isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  // Errors fade away on their own.
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(''), 4500);
    return () => clearTimeout(t);
  }, [err]);

  const onMessage = (m: any) => {
    if (m.type === 'chat') {
      push({ kind: 'chat', text: String(m.text ?? ''), name: String(m.from ?? ''), host: !!m.host, userId: m.userId, messageId: m.id });
    } else if (m.type === 'gift') {
      push({ kind: 'gift', text: `🎁 ${m.from} sent ${m.gift}` });
      setEffects((e) => [
        ...e.slice(-5),
        { id: ++seq.current, from: String(m.from), gift: String(m.gift), emoji: String(m.emoji || '🎁'), coins: Number(m.coins) || 0 },
      ]);
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
    if (sending) return;
    setErr('');
    setSending(true);
    try {
      const r = await api('/gifts/send', {
        method: 'POST',
        body: { streamId, giftId: g.id, idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` },
      });
      setCoins(r.coinBalance);
      success();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  const sendChat = async () => {
    const text = draft.trim();
    if (!text || muted) return;
    setDraft('');
    setErr('');
    try {
      await api(`/streams/${streamId}/chat`, { method: 'POST', body: { text } });
    } catch (e: any) {
      setErr(e.message);
      setDraft(text);
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
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const setSlowMode = async (seconds: number) => {
    setErr('');
    try {
      await api(`/streams/${streamId}/slow-mode`, { method: 'POST', body: { seconds } });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const toggleFollow = async () => {
    const u = creator.username;
    if (!u) return;
    tap();
    const next = !following;
    setFollowing(next);
    try {
      await api(`/creators/${encodeURIComponent(u)}/${next ? 'follow' : 'unfollow'}`, { method: 'POST' });
    } catch (e: any) {
      setFollowing(!next);
      setErr(e.message);
    }
  };

  const leave = async () => {
    leaving.current = true;
    if (isHost) {
      try {
        await api(`/streams/${streamId}/end`, { method: 'POST' });
      } catch {}
    }
    onLeave();
  };

  const goChat = () => {
    if (!friend?.friendshipId || !onOpenChat) return;
    leaving.current = true;
    onOpenChat(String(friend.friendshipId));
  };

  const goProfile = () => {
    if (isHost || !creator.username || !onOpenProfile) return;
    leaving.current = true;
    onOpenProfile(String(creator.username));
  };

  const closeRoom = () => {
    if (isHost) setSheet('end');
    else leave();
  };

  // Android back: close an open panel first, then leave (hosts confirm before ending).
  const sheetRef = useRef<Sheet>('none');
  sheetRef.current = sheet;
  const selectedRef = useRef<FeedItem | null>(null);
  selectedRef.current = selected;
  const closeRef = useRef(closeRoom);
  closeRef.current = closeRoom;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedRef.current) {
        setSelected(null);
        return true;
      }
      if (sheetRef.current !== 'none') {
        setSheet('none');
        return true;
      }
      closeRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const canActOn = !!selected && !!selected.userId && selected.userId !== me.id;
  const lines = feed.slice(-VISIBLE_LINES);
  const fl = flag(creator.country);

  return (
    <View style={[s.wrap, L.tablet && { maxWidth: 520 }]}>
      {/* Video fills the whole screen */}
      <View style={StyleSheet.absoluteFill}>
        <VideoRoom
          url={session.livekitUrl}
          token={session.token}
          publish={isHost}
          onMessage={onMessage}
          onDisconnected={onDisconnected}
          onCount={setViewers}
        />
      </View>
      <GiftOverlay events={effects} onDone={(id) => setEffects((e) => e.filter((x) => x.id !== id))} />

      {/* Top bar */}
      <View style={s.top} pointerEvents="box-none">
        <View style={s.topLeft} pointerEvents="box-none">
          <View style={s.pill}>
            <Pressable onPress={goProfile} style={s.pillMain} accessibilityRole="button" accessibilityLabel="Open creator profile">
              <Avatar name={creator.name} uri={bigAvatar(creator.avatarUrl, 120)} size={36} />
              <View style={s.pillText}>
                <Text style={s.pillName} numberOfLines={1}>
                  {creator.name ?? 'Live'}
                  {fl ? ` ${fl}` : ''}
                </Text>
                <Text style={s.pillSub} numberOfLines={1}>
                  {isHost ? 'You are live' : session.stream.title}
                </Text>
              </View>
            </Pressable>
            {!isHost && !!creator.username && (
              <Pressable
                onPress={toggleFollow}
                hitSlop={6}
                style={[s.follow, following && s.followOn]}
                accessibilityRole="button"
                accessibilityLabel={following ? 'Unfollow creator' : 'Follow creator'}
              >
                <Text style={s.followText} maxFontSizeMultiplier={1.2}>{following ? 'Following' : 'Follow'}</Text>
              </Pressable>
            )}
          </View>
          {!isHost && friend?.status === 'FRIENDS' && !!friend.friendshipId && !!onOpenChat && (
            <Pressable onPress={goChat} hitSlop={6} style={s.msg} accessibilityRole="button" accessibilityLabel="Message creator">
              <Text style={s.followText} maxFontSizeMultiplier={1.2}>💬 Message</Text>
            </Pressable>
          )}
        </View>

        <View style={s.topRight} pointerEvents="box-none">
          <View style={s.count}>
            <Text style={s.countText} maxFontSizeMultiplier={1.2}>👁 {viewers.toLocaleString()}</Text>
          </View>
          <Pressable
            onPress={closeRoom}
            hitSlop={8}
            style={s.close}
            accessibilityRole="button"
            accessibilityLabel={isHost ? 'End live' : 'Leave stream'}
          >
            <Text style={s.closeText}>✕</Text>
          </Pressable>
        </View>
      </View>

      {/* Bottom: transparent chat on the left, tools on the right, input across the full width */}
      <View style={s.bottom} pointerEvents="box-none">
        <View style={s.midRow} pointerEvents="box-none">
          <View style={s.chat} pointerEvents="box-none">
            {!isHost && slow > 0 && <Text style={s.slow}>Slow mode: 1 message per {slow}s</Text>}
            {lines.map((f, i) => (
              <Pressable
                key={f.id}
                disabled={f.kind !== 'chat'}
                onPress={() => setSelected(f)}
                style={[
                  s.line,
                  f.kind === 'gift' && s.lineGift,
                  f.kind === 'system' && s.lineSys,
                  { opacity: 0.5 + 0.5 * ((i + 1) / lines.length) },
                ]}
              >
                <Text style={s.lineText}>
                  {f.kind === 'chat' ? (
                    <>
                      <Text style={[s.lineName, f.host && s.hostName]}>
                        {f.host ? '👑 ' : ''}
                        {f.name}
                        {'  '}
                      </Text>
                      {f.text}
                    </>
                  ) : (
                    f.text
                  )}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={s.rail}>
            {!isHost && (
              <Pressable
                onPress={() => setSheet('gifts')}
                style={[s.railBtn, s.giftBtn]}
                accessibilityRole="button"
                accessibilityLabel="Send a gift"
              >
                <Text style={s.railEmoji}>🎁</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setSheet('tools')}
              style={s.railBtn}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <Text style={s.railDots}>•••</Text>
            </Pressable>
          </View>
        </View>

        {!!err && <Text style={s.err}>{err}</Text>}

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder={muted ? 'You are muted' : 'Say something...'}
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={sendChat}
            blurOnSubmit={false}
            editable={!muted}
            maxLength={200}
            accessibilityLabel="Chat message"
          />
          <Pressable
            onPress={sendChat}
            disabled={!draft.trim() || muted}
            style={[s.send, (!draft.trim() || muted) && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Text style={s.sendText}>➤</Text>
          </Pressable>
        </View>
      </View>

      {/* Gift tray */}
      {sheet === 'gifts' && (
        <SheetView onClose={() => setSheet('none')}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>Send a gift</Text>
            <Text style={s.coins}>🪙 {coins === null ? '...' : Number(coins).toLocaleString()}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {gifts.map((g) => {
              const poor = coins !== null && coins < g.coinPrice;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => sendGift(g)}
                  disabled={poor || sending}
                  accessibilityRole="button"
                  accessibilityLabel={`Send ${g.name} for ${g.coinPrice} coins`}
                  style={[s.tile, (poor || sending) && { opacity: 0.45 }]}
                >
                  <Text style={s.tileEmoji}>{g.emoji ?? '🎁'}</Text>
                  <Text style={s.tileName} numberOfLines={1} maxFontSizeMultiplier={1.2}>{g.name}</Text>
                  <Text style={s.tilePrice} maxFontSizeMultiplier={1.2}>🪙 {Number(g.coinPrice).toLocaleString()}</Text>
                </Pressable>
              );
            })}
            {gifts.length === 0 && <Text style={s.muted}>Loading gifts...</Text>}
          </ScrollView>
        </SheetView>
      )}

      {/* Tools */}
      {sheet === 'tools' && (
        <SheetView onClose={() => { setSheet('none'); refreshFriend(); }}>
          <Text style={s.sheetTitle}>Options</Text>
          {isHost ? (
            <>
              <Text style={s.muted}>Slow mode</Text>
              <View style={s.rowWrap}>
                {SLOW_OPTIONS.map(([sec, label]) => (
                  <Pressable
                    key={sec}
                    onPress={() => setSlowMode(sec)}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityState={{ selected: slow === sec }}
                    style={[s.chip, slow === sec && s.chipOn]}
                  >
                    <Text maxFontSizeMultiplier={1.2} style={[s.chipText, slow === sec && { color: '#fff' }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Btn label="End live" onPress={() => setSheet('end')} />
            </>
          ) : (
            <>
              {!!creator.username && !!onOpenProfile && <Btn label="View profile" onPress={goProfile} outline />}
              {!!creator.id && <FriendButton userId={creator.id} />}
              <Btn
                label="Report this live"
                onPress={() => {
                  setSheet('none');
                  setReportTarget({ targetUserId: creator.id, streamId });
                }}
                outline
              />
              <Btn label="Leave" onPress={leave} outline />
            </>
          )}
          <Btn label="Close" onPress={() => { setSheet('none'); refreshFriend(); }} outline />
        </SheetView>
      )}

      {/* End live confirmation */}
      {sheet === 'end' && (
        <SheetView onClose={() => setSheet('none')}>
          <Text style={s.sheetTitle}>End your live?</Text>
          <Text style={s.muted}>Viewers will be disconnected.</Text>
          <Btn label="End live" onPress={leave} />
          <Btn label="Keep streaming" onPress={() => setSheet('none')} outline />
        </SheetView>
      )}

      {/* Tapped a chat message */}
      {canActOn && (
        <SheetView onClose={() => setSelected(null)}>
          <Text style={s.sheetTitle}>{selected!.name}</Text>
          <Text style={s.muted} numberOfLines={2}>{selected!.text}</Text>
          {isHost && (
            <View style={s.rowWrap}>
              <View style={s.cell}><Btn label="Mute" onPress={() => modAction('mute')} outline /></View>
              <View style={s.cell}><Btn label="Unmute" onPress={() => modAction('unmute')} outline /></View>
              <View style={s.cell}><Btn label="Kick" onPress={() => modAction('kick')} outline /></View>
            </View>
          )}
          <FriendButton key={selected!.userId} userId={selected!.userId} />
          <Btn
            label="Report"
            onPress={() => {
              const t: ReportTarget = { targetUserId: selected!.userId, streamId, messageId: selected!.messageId };
              setSelected(null);
              setReportTarget(t);
            }}
            outline
          />
          <Btn label="Close" onPress={() => setSelected(null)} outline />
        </SheetView>
      )}

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </View>
  );
}

function SheetView({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={sh.backdrop} onPress={onClose} accessibilityLabel="Close panel" />
      <View style={sh.card}>{children}</View>
    </View>
  );
}

const sh = StyleSheet.create({
  backdrop: { ...Object, backgroundColor: 'rgba(0,0,0,0.45)' },
  card: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#1b1524', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, gap: 10, maxHeight: '80%',
  },
});

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000', width: '100%', alignSelf: 'center', overflow: 'hidden' },

  top: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 10, paddingTop: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
  },
  topLeft: { flexShrink: 1, gap: 6, alignItems: 'flex-start' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%',
    backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: 26, padding: 4, paddingRight: 6,
  },
  pillMain: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  pillText: { flexShrink: 1, maxWidth: 130 },
  pillName: { color: '#fff', fontWeight: '800', fontSize: 14 },
  pillSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  follow: { backgroundColor: colors.peach, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  followOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  followText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  msg: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },

  count: { backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  countText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  close: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingBottom: 10, gap: 8 },
  midRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chat: { flex: 1, justifyContent: 'flex-end', gap: 4, maxHeight: 260 },
  slow: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginBottom: 2 },
  line: { alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  lineGift: { backgroundColor: 'rgba(255,122,89,0.55)' },
  lineSys: { backgroundColor: 'rgba(0,0,0,0.2)' },
  lineText: { color: '#fff', fontSize: 14 },
  lineName: { color: '#ffd2c4', fontWeight: '800' },
  hostName: { color: '#ffe08a' },

  rail: { gap: 10, alignItems: 'center' },
  railBtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  giftBtn: { backgroundColor: colors.peach },
  railEmoji: { fontSize: 24 },
  railDots: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1 },

  err: { color: '#ffb3b3', backgroundColor: 'rgba(0,0,0,0.5)', alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12 },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1, height: 44, borderRadius: 22, paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 15,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 18, fontWeight: '900' },

  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { color: colors.text, fontWeight: '800', fontSize: 17 },
  coins: { color: colors.peach, fontWeight: '800' },
  muted: { color: colors.muted },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  cell: { minWidth: 96 },
  chip: { borderWidth: 1, borderColor: colors.peach, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.peach },
  chipText: { color: colors.peach, fontWeight: '700' },

  tile: { width: 84, minHeight: 78, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 8, alignItems: 'center', gap: 2, borderWidth: 1, borderColor: '#2c2438' },
  tileEmoji: { fontSize: 28 },
  tileName: { color: colors.text, fontSize: 12, fontWeight: '600', paddingHorizontal: 4 },
  tilePrice: { color: colors.peach, fontSize: 12, fontWeight: '800' },
});
