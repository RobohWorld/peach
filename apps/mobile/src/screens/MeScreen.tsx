import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import CountryPicker from '../components/CountryPicker';
import { colors } from '../lib/ui';
import { useCachedQuery } from '../lib/cache';
import { countryName, ensureCountrySynced, flag, saveCountry, savedCountry } from '../lib/countries';

const fmt = (n: number) => n.toLocaleString('en-US');

export default function MeScreen({
  onOpenWallet, onOpenLibrary, onOpenSubscriptions, onOpenEarnings, onOpenPayouts, onOpenAdmin, onOpenApply, onOpenProfile, onLogout, onOpenGuidelines
}: {
  onOpenWallet: () => void; onOpenLibrary: () => void; onOpenSubscriptions: () => void; onOpenEarnings: () => void; onOpenPayouts: () => void;
  onOpenAdmin: () => void; onOpenApply: () => void; onOpenProfile: (username: string) => void;
  onOpenGuidelines: () => void;
  onLogout: () => void;
}) {
  // Shows the saved profile instantly and checks the server again every 30s.
  const q = useCachedQuery<any>('/auth/me', { staleMs: 20_000, pollMs: 30_000 });
  const me = q.data;
  const err = q.loaded && !me ? q.error : '';

  const isCreator = me?.role === 'CREATOR';
  const isAdmin = me?.role === 'ADMIN';

  const [country, setCountry] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [countryErr, setCountryErr] = useState('');

  useEffect(() => {
    if (!me?.id || !isCreator) return;
    ensureCountrySynced(me.id);
    setCountry(savedCountry(me.id));
  }, [me?.id, isCreator]);

  const pick = async (cc: string) => {
    if (!me?.id) return;
    setCountryErr('');
    try {
      await saveCountry(me.id, cc);
      setCountry(cc);
      setPicking(false);
    } catch (e: any) {
      setCountryErr(e.message);
      setPicking(false);
    }
  };

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
            <Btn label="My subscriptions" onPress={onOpenSubscriptions} outline />
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
              <Text style={s.muted}>
                Country shown on your live card: {country ? `${flag(country)} ${countryName(country)}` : 'not set'}
              </Text>
              {!!countryErr && <Text style={s.err}>{countryErr}</Text>}
              <Btn label="Change country" onPress={() => setPicking(true)} outline />
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

      <Btn label="Community guidelines" onPress={onOpenGuidelines} outline />
      <Btn label="Log out" onPress={onLogout} outline />

      <CountryPicker visible={picking} selected={country} onPick={pick} onClose={() => setPicking(false)} />
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
