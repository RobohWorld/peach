import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const date = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// Creators the user subscribes to.
export default function SubscriptionsScreen({ onBack, onOpenProfile }: {
  onBack: () => void; onOpenProfile: (username: string) => void;
}) {
  const [items, setItems] = useState<any[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setItems(await api('/me/subscriptions')); setErr(''); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const cancel = async (id: string) => {
    try { await api(`/subscriptions/${id}/cancel`, { method: 'POST' }); setConfirm(null); await load(); }
    catch (e: any) { setErr(e.message); }
  };

  const header = (
    <View style={{ gap: 8 }}>
      <View style={s.top}>
        <Pressable onPress={onBack}><Text style={s.back}>‹ Back</Text></Pressable>
        <Text style={s.title}>My subscriptions</Text>
        <View style={{ width: 50 }} />
      </View>
      {!!err && <Text style={s.err}>{err}</Text>}
    </View>
  );

  return (
    <FlatList
      style={s.wrap}
      contentContainerStyle={{ padding: 16, gap: 8, maxWidth: 520, width: '100%', alignSelf: 'center' }}
      data={items ?? []}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={header}
      ListEmptyComponent={items ? <Text style={s.muted}>You are not subscribed to anyone. Open a creator's profile to subscribe.</Text> : undefined}
      renderItem={({ item }) => (
        <View style={s.card}>
          <Pressable disabled={!item.creatorUsername} onPress={() => item.creatorUsername && onOpenProfile(item.creatorUsername)}>
            <Text style={s.name}>{item.creatorName}{item.creatorUsername ? `  @${item.creatorUsername}` : ''}</Text>
          </Pressable>
          <Text style={s.muted}>
            {item.tierName}
            {item.status === 'CANCELLED' ? ` · access ends ${date(item.currentPeriodEnd)}` : ` · renews ${date(item.currentPeriodEnd)}`}
            {item.nextTier ? ' · tier changes at renewal' : ''}
          </Text>
          {item.status === 'ACTIVE' && (
            confirm === item.id ? (
              <View style={{ gap: 6 }}>
                <Btn label="Yes, cancel renewal" onPress={() => cancel(item.id)} />
                <Btn label="Keep" onPress={() => setConfirm(null)} outline />
              </View>
            ) : (
              <Pressable onPress={() => setConfirm(item.id)}><Text style={s.link}>Cancel renewal</Text></Pressable>
            )
          )}
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { color: colors.peach, fontWeight: '700', width: 50 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 6 },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.muted },
  link: { color: colors.peach, fontWeight: '700' },
  err: { color: colors.error },
});
