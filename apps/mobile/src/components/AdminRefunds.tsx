import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { api } from '../lib/api';
import { colors } from '../lib/ui';
import Btn from '../components/Btn';
import { askText, confirmAction } from '../lib/confirm';

const CAUSES: [string, string][] = [
  ['CREATOR_VIOLATION', 'Creator broke rules'],
  ['CONTENT_MISMATCH', 'Not as described'],
  ['TECHNICAL_ISSUE', 'Technical issue'],
  ['CREATOR_REQUEST', 'Creator withdrew it'],
  ['BUYER_ABUSE', 'Buyer abuse'],
  ['OTHER', 'Other'],
];
const CLAWBACK_DEFAULT = ['CREATOR_VIOLATION', 'CONTENT_MISMATCH'];
const STATUSES = ['PENDING', 'APPROVED', 'DENIED'];

function Group({ g, status, onDone }: { g: any; status: string; onDone: () => void }) {
  const [cause, setCause] = useState<string>(g.rootCause ?? '');
  const [clawback, setClawback] = useState<boolean | null>(null); // null = follow the root-cause default
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const effClaw = clawback ?? CLAWBACK_DEFAULT.includes(cause);

  const view = async () => {
    try { const r = await api(`/admin/media/${g.mediaId}/view`); await Linking.openURL(r.url); }
    catch (e: any) { setErr(e.message); }
  };

  const decide = async (decision: 'approve' | 'deny') => {
    if (!cause) return setErr('Pick a root cause first');
    let note = '';
    if (decision === 'deny') {
      const r = askText('Reason for denying (the buyers will see this):');
      if (r === null) return;
      note = r;
    } else if (!confirmAction(`Refund ${g.coins.toLocaleString()} coins to ${g.cases} buyer(s)${effClaw ? " and claw back the creator's diamonds" : ''}?`)) {
      return;
    }
    setBusy(true); setErr('');
    try {
      const r = await api(`/admin/refunds/item/${g.mediaId}/${decision}`, {
        method: 'POST', body: { rootCause: cause, note, clawback: effClaw },
      });
      if (r.remaining > 0) setErr(`${r.remaining} case(s) still pending: press again to continue`);
      else onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <View style={s.card}>
      <Text style={s.name}>{g.title}</Text>
      <Text style={s.muted}>
        {g.type} · {g.source === 'ADMIN_REMOVED' ? 'Removed by admin' : 'Removed by creator'}
        {g.reason ? ` · "${g.reason}"` : ''}
      </Text>
      <Text style={s.muted}>
        Creator: {g.creator.name ?? '?'}{g.creator.username ? ` (@${g.creator.username})` : ''} ·
        {' '}{g.creatorStats.refundCases90d} refund cases in 90 days · {g.creatorStats.removedItems} items removed
      </Text>
      <Text style={s.text}>
        {g.cases} buyer(s) · 🪙 {g.coins.toLocaleString()} total
        {g.buyers.length ? `  (${g.buyers.map((b: any) => b.name ?? 'user').join(', ')}${g.cases > g.buyers.length ? '…' : ''})` : ''}
      </Text>
      <Btn label="View content" onPress={view} outline />

      {status === 'PENDING' ? (
        <>
          <Text style={s.label}>Root cause</Text>
          <View style={s.chips}>
            {CAUSES.map(([k, label]) => (
              <Pressable key={k} onPress={() => { setCause(k); setClawback(null); }} style={[s.chip, cause === k && s.chipOn]}>
                <Text style={[s.chipText, cause === k && { color: '#fff' }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setClawback(!effClaw)} style={[s.chip, effClaw && s.chipOn, { alignSelf: 'flex-start' }]}>
            <Text style={[s.chipText, effClaw && { color: '#fff' }]}>
              Claw back creator's 💎: {effClaw ? 'ON' : 'OFF'}
            </Text>
          </Pressable>
          <View style={s.row}>
            <Btn label={`Refund all (${g.cases})`} onPress={() => decide('approve')} disabled={busy} />
            <Btn label="Deny all" onPress={() => decide('deny')} disabled={busy} outline />
          </View>
        </>
      ) : (
        <Text style={s.muted}>
          {status === 'APPROVED' ? 'Refunded' : 'Denied'} · {g.rootCause}{g.adminNote ? ` · ${g.adminNote}` : ''}
        </Text>
      )}
      {!!err && <Text style={s.err}>{err}</Text>}
    </View>
  );
}

export default function AdminRefunds() {
  const [status, setStatus] = useState('PENDING');
  const [groups, setGroups] = useState<any[] | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setGroups(await api(`/admin/refunds?status=${status}`)); setErr(''); } catch (e: any) { setErr(e.message); }
  }, [status]);
  useEffect(() => { setGroups(null); load(); }, [load]);

  return (
    <View style={{ gap: 10 }}>
      <View style={s.chips}>
        {STATUSES.map((k) => (
          <Pressable key={k} onPress={() => setStatus(k)} style={[s.chip, status === k && s.chipOn]}>
            <Text style={[s.chipText, status === k && { color: '#fff' }]}>{k.toLowerCase()}</Text>
          </Pressable>
        ))}
      </View>
      {!!err && <Text style={s.err}>{err}</Text>}
      {groups && groups.length === 0 && <Text style={s.muted}>No {status.toLowerCase()} refund cases.</Text>}
      {(groups ?? []).map((g) => <Group key={g.mediaId} g={g} status={status} onDone={load} />)}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 8 },
  name: { color: colors.text, fontWeight: '700', fontSize: 16 },
  text: { color: colors.text },
  muted: { color: colors.muted },
  label: { color: colors.muted, fontWeight: '700', marginTop: 4 },
  err: { color: colors.error },
  row: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.peach, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.peach },
  chipText: { color: colors.peach, fontWeight: '700' },
});