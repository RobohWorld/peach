import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';

import { api } from '../lib/api';
import { colors } from '../lib/ui';
import { useCachedQuery } from '../lib/cache';
import { prefetchImages } from '../lib/prefetch';

import WalletChip from '../components/WalletChip';
import NotificationBell from '../components/NotificationBell';
import LiveCard from '../components/LiveCard';
import Avatar, { bigAvatar } from '../components/Avatar';

const SORTS: [string, string][] = [
  ['popular', 'Popular'],
  ['new', 'New'],
  ['following', 'Following'],
];

const CATS: [string, string][] = [
  ['', 'All'],
  ['chat', 'Chat'],
  ['music', 'Music'],
  ['dance', 'Dance'],
  ['gaming', 'Gaming'],
  ['fitness', 'Fitness'],
  ['talk', 'Talk'],
  ['other', 'Other'],
];

const PAD = 12;
const GAP = 10;
const MAX_W = 1100;

export default function HomeScreen({
  onOpenRoom,
  onOpenProfile,
  onOpenWallet,
  onOpenNotifications,
}: {
  onOpenRoom: (session: any) => void;
  onOpenProfile: (username: string) => void;
  onOpenWallet: () => void;
  onOpenNotifications: () => void;
}) {
  const [width, setWidth] = useState(0);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [sort, setSort] = useState('popular');
  const [category, setCategory] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [joinErr, setJoinErr] = useState('');

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const term = dq.trim();
  const searching = term.length >= 2;

  const qs =
    `sort=${sort}` +
    (category ? `&category=${category}` : '') +
    (searching ? `&q=${encodeURIComponent(term)}` : '');

  // Saved copy shows instantly. The server is asked again at most every 15s while Home is open,
  // and the grid only redraws when something actually changed.
  const live = useCachedQuery<any[]>(`/streams/live?${qs}`, { staleMs: 8_000, pollMs: 15_000 });
  const found = useCachedQuery<any[]>(
    searching ? `/creators/search?q=${encodeURIComponent(term)}` : null,
    { staleMs: 5 * 60_000 },
  );

  const items = live.data ?? [];
  const creators = searching ? found.data ?? [] : [];

  // Warm the image cache so cards do not pop in one by one.
  useEffect(() => {
    prefetchImages(items.map((i) => bigAvatar(i.creator?.avatarUrl)));
  }, [live.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols = width >= 1200 ? 4 : width >= 760 ? 3 : 2;
  const inner = Math.min(width, MAX_W) - PAD * 2;
  const cardW = Math.max(120, Math.floor((inner - GAP * (cols - 1)) / cols));

  const watch = async (st: any) => {
    setBusyId(st.id);
    setJoinErr('');
    try {
      const r = await api(`/streams/${st.id}/join`, { method: 'POST' });
      onOpenRoom({ ...r, publish: false });
    } catch (e: any) {
      setJoinErr(e.message);
      live.refresh(); // the stream probably ended: refresh the grid
    } finally {
      setBusyId(null);
    }
  };

  const err = joinErr || (live.loaded && items.length === 0 ? live.error : '');

  const header = (
    <View style={s.header}>
      <View style={s.top}>
        <Text style={s.logo}>🍑 Peach Live</Text>
        <View style={s.topRight}>
          <NotificationBell onPress={onOpenNotifications} />
          <WalletChip onPress={onOpenWallet} />
        </View>
      </View>

      <TextInput
        style={s.input}
        placeholder="Search streams and creators"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        value={q}
        onChangeText={setQ}
      />

      <View style={s.row}>
        {SORTS.map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setSort(key)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityState={{ selected: sort === key }}
            style={[s.chip, sort === key && s.chipOn]}
          >
            <Text maxFontSizeMultiplier={1.2} style={[s.chipText, sort === key && { color: '#fff' }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryList}>
        {CATS.map(([key, label]) => (
          <Pressable
            key={key || 'all'}
            onPress={() => setCategory(key)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityState={{ selected: category === key }}
            style={[s.chip, s.chipSoft, category === key && s.chipOn]}
          >
            <Text maxFontSizeMultiplier={1.2} style={[s.chipText, category === key && { color: '#fff' }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {!!err && <Text style={s.err}>{err}</Text>}

      {creators.length > 0 && (
        <>
          <Text style={s.section}>Creators</Text>
          {creators.map((c) => (
            <Pressable
              key={c.username}
              style={s.creatorRow}
              onPress={() => onOpenProfile(c.username)}
              accessibilityRole="button"
            >
              <Avatar name={c.name} uri={c.avatarUrl} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                <Text style={s.muted} numberOfLines={1}>
                  @{c.username} · {c.followers} follower{c.followers === 1 ? '' : 's'}
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      )}

      <Text style={s.section}>Live now</Text>
    </View>
  );

  const skeletons = Array.from({ length: cols * 2 });

  return (
    <View style={s.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <FlatList
        key={cols}
        numColumns={cols}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{
          padding: PAD,
          gap: GAP,
          maxWidth: MAX_W,
          width: '100%',
          alignSelf: 'center',
          paddingBottom: 24,
        }}
        data={items}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={live.refreshing}
            onRefresh={live.refresh}
            tintColor={colors.peach}
            colors={[colors.peach]}
          />
        }
        ListEmptyComponent={
          live.loaded ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🍑</Text>
              <Text style={s.emptyTitle}>
                {sort === 'following' ? 'Nobody you follow is live' : 'Nobody is live yet'}
              </Text>
              <Text style={s.muted}>
                {sort === 'following'
                  ? 'Follow creators to see them here when they go live.'
                  : 'Pull down to refresh, or start your own live from the Go Live tab.'}
              </Text>
            </View>
          ) : (
            <View style={s.skelGrid}>
              {skeletons.map((_, i) => (
                <View key={i} style={[s.skel, { width: cardW, height: Math.round(cardW * 1.25) }]} />
              ))}
            </View>
          )
        }
        renderItem={({ item }) => (
          <LiveCard
            stream={item}
            width={cardW}
            busy={busyId === item.id}
            onPress={() => watch(item)}
          />
        )}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { gap: 10, marginBottom: 2 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  logo: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  categoryList: { gap: 8 },
  name: { color: colors.text, fontWeight: '700', fontSize: 15 },
  muted: { color: colors.muted },
  section: { color: colors.text, fontWeight: '700', fontSize: 18, marginTop: 6 },
  input: { backgroundColor: colors.card, color: colors.text, padding: 12, borderRadius: 12 },
  chip: {
    borderWidth: 1, borderColor: colors.peach, borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 8, minHeight: 38, justifyContent: 'center',
  },
  chipSoft: { borderColor: '#3a3048' },
  chipOn: { backgroundColor: colors.peach, borderColor: colors.peach },
  chipText: { color: colors.peach, fontWeight: '700' },
  err: { color: colors.error },
  creatorRow: {
    backgroundColor: colors.card, borderRadius: 12, padding: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 40, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 17, textAlign: 'center' },
  skelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  skel: { borderRadius: 16, backgroundColor: colors.card },
});
