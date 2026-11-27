import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';

import { api } from '../lib/api';
import { colors } from '../lib/ui';
import { usePolling } from '../lib/usePolling';
import { useLayout } from '../lib/useLayout';

import WalletChip from '../components/WalletChip';
import NotificationBell from '../components/NotificationBell';

// Module-level cache: instant list when returning to Home.
const feedCache: { live: any[] | null } = { live: null };

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
  const L = useLayout();

  const [live, setLive] = useState<any[]>(feedCache.live ?? []);
  const [loaded, setLoaded] = useState(feedCache.live !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [dq, setDq] = useState('');

  const [creators, setCreators] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('popular');
  const [category, setCategory] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Load live streams and matching creators.
  const load = useCallback(async () => {
    try {
      const term = dq.trim();
      const searching = term.length >= 2;

      const qs = `sort=${sort}${category ? `&category=${category}` : ''}${searching ? `&q=${encodeURIComponent(term)}` : ''}`;

      const [l, c] = await Promise.all([
        api(`/streams/live?${qs}`),
        searching
          ? api(`/creators/search?q=${encodeURIComponent(term)}`)
          : Promise.resolve([]),
      ]);

      setLive(l);
      setCreators(c);
      setErr('');

      if (!searching && sort === 'popular' && !category) {
        feedCache.live = l;
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoaded(true);
    }
  }, [dq, sort, category]);

  // Foreground-only polling.
  usePolling(load, 10000, [load]);

  // Pull to refresh.
  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const watch = async (st: any) => {
    setBusy(true);
    setErr('');

    try {
      const r = await api(`/streams/${st.id}/join`, {
        method: 'POST',
      });

      onOpenRoom({ ...r, publish: false });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

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

      {/* Sort chips */}
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
            <Text
              maxFontSizeMultiplier={1.2}
              style={[
                s.chipText,
                sort === key && { color: '#fff' },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.categoryList}
      >
        {CATS.map(([key, label]) => (
          <Pressable
            key={key || 'all'}
            onPress={() => setCategory(key)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityState={{ selected: category === key }}
            style={[
              s.chip,
              category === key && s.chipOn,
            ]}
          >
            <Text
              maxFontSizeMultiplier={1.2}
              style={[
                s.chipText,
                category === key && { color: '#fff' },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {!!err && <Text style={s.err}>{err}</Text>}

      {/* Creator search results */}
      {creators.length > 0 && (
        <>
          <Text style={s.section}>Creators</Text>

          {creators.map((c) => (
            <Pressable
              key={c.username}
              style={s.stream}
              onPress={() => onOpenProfile(c.username)}
              accessibilityRole="button"
            >
              <Text style={s.name}>{c.name}</Text>

              <Text style={s.muted}>
                @{c.username} · {c.followers} follower
                {c.followers === 1 ? '' : 's'}
              </Text>
            </Pressable>
          ))}
        </>
      )}

      <Text style={s.section}>Live now</Text>
    </View>
  );

  return (
    <FlatList
      key={L.columns}
      style={s.wrap}
      numColumns={L.columns}
      columnWrapperStyle={
        L.columns > 1 ? { gap: 10 } : undefined
      }
      contentContainerStyle={{
        padding: 16,
        gap: 10,
        maxWidth: L.contentMax,
        width: '100%',
        alignSelf: 'center',
      }}
      data={live}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={header}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.peach}
          colors={[colors.peach]}
        />
      }
      ListEmptyComponent={
        loaded
          ? (
            <Text style={s.muted}>
              {sort === 'following'
                ? 'None of the creators you follow are live.'
                : 'Nobody is live yet.'}
            </Text>
          )
          : <ActivityIndicator color={colors.peach} />
      }
      renderItem={({ item }) => (
        <Pressable
          style={[
            s.stream,
            L.columns > 1 && {
              flex: 1,
              maxWidth: `${100 / L.columns}%`,
            },
          ]}
          onPress={() => watch(item)}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={s.name}>🔴 {item.title}</Text>

          <Text style={s.muted}>
            {item.creator?.name}
            {item.creator?.username
              ? ` · @${item.creator.username}`
              : ''}
          </Text>

          {!!item.category && (
            <Text style={s.muted}>
              #{item.category}
              {(item.tags ?? []).map(
                (t: string) => ` #${t}`
              ).join('')}
            </Text>
          )}

          <View style={s.row}>
            <Text style={s.muted}>
              👁 {item.viewers}   ♥ {item.followers}
            </Text>

            {!!item.creator?.username && (
              <Pressable
                onPress={() =>
                  onOpenProfile(item.creator.username)
                }
                accessibilityRole="button"
              >
                <Text style={s.link2}>View profile</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  header: {
    gap: 10,
  },

  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  topRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },

  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  logo: {
    color: colors.peach,
    fontSize: 24,
    fontWeight: '800',
  },

  link2: {
    color: colors.peach,
    fontWeight: '700',
  },

  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },

  categoryList: {
    gap: 8,
  },

  name: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },

  muted: {
    color: colors.muted,
  },

  section: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 18,
    marginTop: 8,
  },

  stream: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },

  input: {
    backgroundColor: colors.card,
    color: colors.text,
    padding: 12,
    borderRadius: 10,
  },

  chip: {
    borderWidth: 1,
    borderColor: colors.peach,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: 'center',
  },

  chipOn: {
    backgroundColor: colors.peach,
  },

  chipText: {
    color: colors.peach,
    fontWeight: '700',
  },

  err: {
    color: colors.error,
  },
});
