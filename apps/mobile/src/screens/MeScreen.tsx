import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const fmt = (n: number) => n.toLocaleString('en-US');

export default function MeScreen({
  onOpenWallet, onOpenLibrary, onOpenEarnings, onOpenPayouts, onOpenAdmin, onOpenApply, onOpenProfile, onLogout,
}: {
  onOpenWallet: () => void; onOpenLibrary: () => void; onOpenEarnings: () => void; onOpenPayouts: () => void;
  onOpenAdmin: () => void; onOpenApply: () => void; onOpenProfile: (username: string) => void;
  onLogout: () => void;
}) {
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setMe(await api('/auth/me')); setErr(''); } catch (e: any) { setErr(e.message); }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 15000);
    return () => clearInterval(poll);
  }, [load]);

  const isCreator = me?.role === 'CREATOR';
  const isAdmin = me?.role === 'ADMIN';

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.content}>
      <Text style={s.title}>Me</Text>
      {!!err && <Text style={s.err}>{err}</Text>}

      {me && (
        <>
          <View style={s.card}>
            <Text style={s.name}>{me.name}</Text>
            <Text style={s.muted}>{isCreator ? 'Creator' : isAdmin ? 'Admin' : 'Viewer'}</Text>
            <View style={s.balances}>
              <View style={s.bal}>
                <Text style={s.balValue}>{fmt(me.wallet?.coinBalance ?? 0)}</Text>
                <Text style={s.muted}>Coins</Text>
              </View>
              <View style={s.bal}>
                <Text style={s.balValue}>{fmt(me.wallet?.diamondBalance ?? 0)}</Text>
                <Text style={s.muted}>Diamonds</Text>
              </View>
            </View>
            <Btn label="Wallet and history" onPress={onOpenWallet} />
            <Btn label="My library" onPress={onOpenLibrary} outline />
          </View>

          {!isCreator && !isAdmin && (
            <View style={s.card}>
              <Text style={s.name}>Want to earn on Peach Live?</Text>
              <Btn label="Become a creator" onPress={onOpenApply} outline />
            </View>
          )}

          {isCreator && (
            <View style={s.card}>
              <Text style={s.name}>Creator</Text>
              {!!me.creator?.username && (
                <Btn label="My profile" onPress={() => onOpenProfile(me.creator.username)} outline />
              )}
              <Btn label="Earnings" onPress={onOpenEarnings} outline />
              <Btn label="Payouts" onPress={onOpenPayouts} outline />
            </View>
          )}

          {isAdmin && (
            <View style={s.card}>
              <Btn label="Admin panel" onPress={onOpenAdmin} />
            </View>
          )}
        </>
      )}

      <Btn label="Log out" onPress={onLogout} outline />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  title: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 10 },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.muted },
  balances: { flexDirection: 'row', gap: 10 },
  bal: { flex: 1, backgroundColor: colors.bg, borderRadius: 10, padding: 12, gap: 2 },
  balValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  err: { color: colors.error },
});
