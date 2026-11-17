import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const METHODS: [string, string][] = [['BANK', 'Bank'], ['PAYPAL', 'PayPal'], ['OTHER', 'Other']];
const STATUS_COLOR: Record<string, string> = {
  PENDING: '#e0b341', APPROVED: '#4aa3ff', PAID: '#4cc38a', REJECTED: colors.error,
};

export default function PayoutsScreen({ onBack }: { onBack: () => void }) {
  const [info, setInfo] = useState<any>(null);
  const [balance, setBalance] = useState<number>(0);
  const [diamonds, setDiamonds] = useState('');
  const [method, setMethod] = useState('BANK');
  const [dest, setDest] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, me] = await Promise.all([api('/payouts'), api('/auth/me')]);
      setInfo(p); setBalance(me.wallet?.diamondBalance ?? 0);
    } catch (e: any) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const n = parseInt(diamonds, 10) || 0;
  const cents = info ? Math.floor(n * info.centsPerDiamond) : 0;

  const submit = async () => {
    setBusy(true); setErr(''); setOk('');
    try {
      await api('/payouts', { method: 'POST', body: { diamonds: n, method, destination: dest.trim() } });
      setOk('Payout request sent. Diamonds are on hold until it is processed.');
      setDiamonds(''); setDest('');
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>Payouts</Text>
        <Pressable onPress={onBack}><Text style={s.link}>Back</Text></Pressable>
      </View>

      <View style={s.card}>
        <Text style={s.big}>💎 {balance}</Text>
        <Text style={s.muted}>Available diamonds{info ? ` · minimum ${info.minDiamonds} · 1 💎 = ${money(info.centsPerDiamond)}` : ''}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.warn}>Test mode: no real money moves. Don't enter real bank or card details.</Text>
        <TextInput style={s.input} placeholder="Diamonds to cash out" placeholderTextColor={colors.muted}
          keyboardType="numeric" value={diamonds} onChangeText={setDiamonds} />
        {n > 0 && <Text style={s.muted}>You would receive {money(cents)}</Text>}
        <View style={s.row}>
          {METHODS.map(([val, label]) => (
            <Pressable key={val} onPress={() => setMethod(val)} style={[s.chip, method === val && s.chipOn]}>
              <Text style={[s.chipText, method === val && { color: '#fff' }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={s.input} placeholder="Test destination label (e.g. My test account)" placeholderTextColor={colors.muted}
          value={dest} onChangeText={setDest} maxLength={80} />
        {!!err && <Text style={s.err}>{err}</Text>}
        {!!ok && <Text style={s.okText}>{ok}</Text>}
        <Btn label={busy ? 'Sending...' : 'Request payout'} onPress={submit} disabled={busy || n < 1 || !dest.trim()} />
      </View>

      <Text style={s.section}>Your requests</Text>
      {info && info.requests.length === 0 && <Text style={s.muted}>No requests yet.</Text>}
      {info?.requests.map((r: any) => (
        <View key={r.id} style={s.item}>
          <View style={{ flex: 1 }}>
            <Text style={s.text}>💎 {r.diamonds} · {money(r.amountCents)} · {r.method}</Text>
            <Text style={s.muted}>{new Date(r.createdAt).toLocaleString()} · {r.destination}</Text>
            {!!r.adminNote && <Text style={s.muted}>Note: {r.adminNote}</Text>}
          </View>
          <Text style={[s.status, { color: STATUS_COLOR[r.status] }]}>{r.status}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  link: { color: colors.peach, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 10 },
  big: { color: colors.text, fontSize: 28, fontWeight: '800' },
  warn: { color: '#e0b341', fontWeight: '600' },
  input: { backgroundColor: colors.bg, color: colors.text, padding: 12, borderRadius: 10 },
  row: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.peach, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  chipOn: { backgroundColor: colors.peach },
  chipText: { color: colors.peach, fontWeight: '700' },
  section: { color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 10, padding: 10 },
  status: { fontWeight: '800' },
  text: { color: colors.text },
  muted: { color: colors.muted },
  err: { color: colors.error },
  okText: { color: '#4cc38a' },
});
