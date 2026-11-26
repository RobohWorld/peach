import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Linking, StyleSheet } from 'react-native';
import { api } from '../lib/api';
import { colors } from '../lib/ui';
import  Btn  from './Btn';
import { askText } from '../lib/confirm';

export default function AdminContent() {
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api('/admin/media/pending')); setErr(''); } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (it: any, action: 'approve' | 'remove') => {
    let note = '';
    if (action === 'remove') {
      const r = askText('Reason for removing (logged, and shown to buyers if any):');
      if (r === null) return;
      note = r;
    }
    setBusy(true); setErr('');
    try { await api(`/admin/media/${it.id}/${action}`, { method: 'POST', body: { note } }); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: 10 }}>
      {!!err && <Text style={s.err}>{err}</Text>}
      {items && items.length === 0 && <Text style={s.muted}>Nothing waiting for review.</Text>}
      {(items ?? []).map((it) => (
        <View key={it.id} style={s.card}>
          <Text style={s.name}>{it.title}</Text>
          <Text style={s.muted}>
            {it.type} · {it.priceCoins ? `🪙 ${Number(it.priceCoins).toLocaleString()}` : 'no price'}{it.minTier ? ` · tier ${it.minTier}+` : ''}
          </Text>
          {it.type === 'IMAGE' && !!it.url && (
            <Image source={{ uri: it.url }} style={s.img} resizeMode="contain" />
          )}
          {it.type === 'VIDEO' && !!it.url && <Btn label="▶ Open video" onPress={() => Linking.openURL(it.url)} outline />}
          <View style={s.row}>
            <Btn label="Approve" onPress={() => act(it, 'approve')} disabled={busy} />
            <Btn label="Remove" onPress={() => act(it, 'remove')} disabled={busy} outline />
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 8 },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  muted: { color: colors.muted },
  err: { color: colors.error },
  img: { width: '100%', height: 240, borderRadius: 8, backgroundColor: '#000' },
  row: { flexDirection: 'row', gap: 8 },
});