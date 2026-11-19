import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const KIND_LABEL: Record<string, string> = {
  SIGNUP_GRANT: 'Welcome bonus',
  DEV_TOPUP: 'Test top-up',
  COIN_PURCHASE: 'Coins purchased',
  GIFT_SENT: 'Gift sent',
  GIFT_RECEIVED: 'Gift received',
  CONTENT_PURCHASE: 'Content purchased',
  CONTENT_SALE: 'Content sold',
  SUBSCRIPTION_CHARGE: 'Subscription',
  SUBSCRIPTION_EARNING: 'Subscriber earnings',
  PAYOUT: 'Payout',
  ADJUSTMENT: 'Adjustment',
};

const fmt = (n: number) => n.toLocaleString('en-US');

export default function WalletScreen({ onBack }: { onBack: () => void }) {
  const [wallet, setWallet] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (after?: string | null) => {
    setLoading(true);
    try {
      const qs = after ? `?cursor=${encodeURIComponent(after)}` : '';
      const [w, page] = await Promise.all([
        after ? Promise.resolve(null) : api('/wallet'),
        api(`/wallet/transactions${qs}`),
      ]);
      if (w) setWallet(w);
      setItems((prev) => (after ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setErr('');
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const header = (
    <View style={{ gap: 12 }}>
      <View style={s.top}>
        <Pressable onPress={onBack}><Text style={s.back}>‹ Back</Text></Pressable>
        <Text style={s.title}>Wallet</Text>
        <View style={{ width: 50 }} />
      </View>
      <View style={s.balances}>
        <View style={s.bal}>
          <Text style={s.balValue}>{fmt(wallet?.coinBalance ?? 0)}</Text>
          <Text style={s.muted}>Coins</Text>
        </View>
        <View style={s.bal}>
          <Text style={s.balValue}>{fmt(wallet?.diamondBalance ?? 0)}</Text>
          <Text style={s.muted}>Diamonds</Text>
        </View>
      </View>
      <Text style={s.muted}>Coins and diamonds are test currency for now.</Text>
      {!!err && <Text style={s.err}>{err}</Text>}
      <Text style={s.section}>History</Text>
    </View>
  );

  return (
    <FlatList
      style={s.wrap}
      contentContainerStyle={{ padding: 16, gap: 8, maxWidth: 520, width: '100%', alignSelf: 'center' }}
      data={items}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={header}
      ListEmptyComponent={!loading ? <Text style={s.muted}>No transactions yet.</Text> : null}
      ListFooterComponent={
        cursor ? (
          <Pressable onPress={() => load(cursor)} disabled={loading} style={s.more}>
            <Text style={s.moreText}>{loading ? 'Loading…' : 'Load more'}</Text>
          </Pressable>
        ) : null
      }
      renderItem={({ item }) => {
        const positive = item.amount > 0;
        return (
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{KIND_LABEL[item.kind] ?? item.kind}</Text>
              <Text style={s.muted}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
            <Text style={[s.amount, { color: positive ? '#6fdc8c' : colors.text }]}>
              {positive ? '+' : '−'}{fmt(Math.abs(item.amount))} {item.currency === 'COIN' ? '🪙' : '💎'}
            </Text>
          </View>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { color: colors.peach, fontWeight: '700', width: 50 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  balances: { flexDirection: 'row', gap: 10 },
  bal: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 2 },
  balValue: { color: colors.text, fontSize: 26, fontWeight: '800' },
  section: { color: colors.text, fontWeight: '700', fontSize: 18, marginTop: 8 },
  row: { backgroundColor: colors.card, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontWeight: '700' },
  amount: { fontWeight: '800', fontSize: 15 },
  muted: { color: colors.muted },
  more: { alignItems: 'center', padding: 12 },
  moreText: { color: colors.peach, fontWeight: '700' },
  err: { color: colors.error },
});
