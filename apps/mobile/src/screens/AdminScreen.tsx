import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import Btn from '../components/Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';
import { askText, confirmAction } from '../lib/confirm';

type Tab = 'overview' | 'applications' | 'reports' | 'streams' | 'payouts' | 'users';
const TABS: [Tab, string][] = [
  ['overview', 'Overview'], ['applications', 'Creators'], ['reports', 'Reports'],
  ['streams', 'Streams'], ['payouts', 'Payouts'], ['users', 'Users'],
];
const P_STATUS = ['PENDING', 'APPROVED', 'PAID', 'REJECTED'];
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function AdminScreen({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [pStatus, setPStatus] = useState('PENDING');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const searchUsers = useCallback(async () => {
    if (q.trim().length < 2) { setUsers([]); return; }
    setUsers(await api(`/admin/users?q=${encodeURIComponent(q.trim())}`));
  }, [q]);

  const load = useCallback(async () => {
    try {
      setErr('');
      if (tab === 'overview') setOverview(await api('/admin/overview'));
      if (tab === 'applications') setApps(await api('/admin/applications?status=PENDING'));
      if (tab === 'reports') setReports(await api('/admin/reports'));
      if (tab === 'streams') setStreams(await api('/admin/streams'));
      if (tab === 'payouts') setPayouts(await api(`/admin/payouts?status=${pStatus}`));
      if (tab === 'users') await searchUsers();
    } catch (e: any) { setErr(e.message); }
  }, [tab, pStatus, searchUsers]);

  useEffect(() => { load(); }, [tab, pStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<any>) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const suspend = (userId: string, name: string) => {
    const reason = askText(`Reason for suspending ${name}:`, 'Policy violation');
    if (reason === null) return;
    if (!confirmAction(`Suspend ${name}? Their live streams end immediately and they are blocked from the app.`)) return;
    act(() => api(`/admin/users/${userId}/suspend`, { method: 'POST', body: { reason: reason || 'Policy violation' } }));
  };

  const endStream = (id: string) => {
    if (!confirmAction('End this stream now?')) return;
    act(() => api(`/admin/streams/${id}/end`, { method: 'POST' }));
  };

  const resolve = (id: string) => {
    const note = askText('Note (optional):');
    if (note === null) return;
    act(() => api(`/admin/reports/${id}/resolve`, { method: 'POST', body: { note } }));
  };

  const payoutAction = (id: string, action: 'approve' | 'pay' | 'reject') => {
    let note = '';
    if (action === 'reject') {
      const r = askText('Reason for rejecting (the creator will see it):');
      if (r === null) return;
      note = r;
    }
    act(() => api(`/admin/payouts/${id}/${action}`, { method: 'POST', body: { note } }));
  };

  const approveApp = (a: any) => {
    if (!confirmAction(`Approve @${a.username}? Only do this after you have verified they are 18+ and who they say they are.`)) return;
    act(() => api(`/admin/applications/${a.id}/approve`, { method: 'POST', body: {} }));
  };

  const rejectApp = (a: any) => {
    const note = askText('Reason for rejecting (the applicant will see it):');
    if (note === null) return;
    act(() => api(`/admin/applications/${a.id}/reject`, { method: 'POST', body: { note } }));
  };

  const grant = (u: any) => {
    const raw = askText(`Test coins to grant ${u.name} (1-100000):`, '500');
    if (raw === null) return;
    const coins = parseInt(raw, 10);
    if (!coins || coins < 1) { setErr('Enter a positive number'); return; }
    act(() => api(`/admin/users/${u.id}/grant-coins`, { method: 'POST', body: { coins, note: 'test coins' } }));
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={s.wrap}>
      <View style={s.header}>
        <Text style={s.title}>Admin</Text>
        <Pressable onPress={onBack}><Text style={s.link}>Back</Text></Pressable>
      </View>

      <View style={s.row}>
        {TABS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[s.chip, tab === key && s.chipOn]}>
            <Text style={[s.chipText, tab === key && { color: '#fff' }]}>{label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={load}><Text style={s.link}>↻</Text></Pressable>
      </View>

      {!!err && <Text style={s.err}>{err}</Text>}

      {tab === 'overview' && overview && (
        <View style={s.grid}>
          <Stat label="Creator applications" value={overview.pendingApplications} />
          <Stat label="Open reports" value={overview.openReports} />
          <Stat label="🚨 Severe reports" value={overview.severeReports} />
          <Stat label="Live streams" value={overview.liveStreams} />
          <Stat label="Pending payouts" value={overview.pendingPayouts} />
          <Stat label="Pending 💎" value={overview.pendingPayoutDiamonds} />
          <Stat label="Pending amount" value={money(overview.pendingPayoutCents)} />
        </View>
      )}

      {tab === 'applications' && (
        <>
          {apps.length === 0 && <Text style={s.muted}>No pending applications.</Text>}
          {apps.map((a) => (
            <View key={a.id} style={s.card}>
              <Text style={s.cardTitle}>@{a.username}</Text>
              <Text style={s.muted}>{a.user?.name} · {a.user?.email}</Text>
              <Text style={s.muted}>Applied {new Date(a.createdAt).toLocaleString()} · age {a.user?.ageDeclaredAt ? 'self-confirmed 18+' : 'not confirmed'}</Text>
              {!!a.bio && <Text style={s.text}>{a.bio}</Text>}
              <View style={s.row}>
                <View style={s.cell}><Btn label="Approve" onPress={() => approveApp(a)} disabled={busy} /></View>
                <View style={s.cell}><Btn label="Reject" onPress={() => rejectApp(a)} disabled={busy} outline /></View>
              </View>
            </View>
          ))}
        </>
      )}

      {tab === 'reports' && (
        <>
          {reports.length === 0 && <Text style={s.muted}>No open reports. 🎉</Text>}
          {reports.map((r) => (
            <View key={r.id} style={[s.card, r.severe && s.severe]}>
              <Text style={s.cardTitle}>{r.severe ? '🚨 ' : ''}{r.reason}</Text>
              <Text style={s.muted}>
                {r.reporter?.name ?? '?'} reported {r.target?.name ?? '?'} · {new Date(r.createdAt).toLocaleString()}
              </Text>
              {!!r.details && <Text style={s.text}>{r.details}</Text>}
              <View style={s.row}>
                <View style={s.cell}><Btn label="Dismiss" onPress={() => resolve(r.id)} disabled={busy} outline /></View>
                <View style={s.cell}><Btn label="Suspend user" onPress={() => suspend(r.targetUserId, r.target?.name ?? 'user')} disabled={busy} outline /></View>
                {!!r.streamId && <View style={s.cell}><Btn label="End stream" onPress={() => endStream(r.streamId)} disabled={busy} outline /></View>}
              </View>
            </View>
          ))}
        </>
      )}

      {tab === 'streams' && (
        <>
          {streams.length === 0 && <Text style={s.muted}>Nobody is live.</Text>}
          {streams.map((st) => (
            <View key={st.id} style={s.card}>
              <Text style={s.cardTitle}>{st.title}</Text>
              <Text style={s.muted}>{st.creator?.name} · {st.creator?.email} · since {new Date(st.startedAt).toLocaleTimeString()}</Text>
              <View style={s.row}>
                <View style={s.cell}><Btn label="End stream" onPress={() => endStream(st.id)} disabled={busy} outline /></View>
                <View style={s.cell}><Btn label="Suspend creator" onPress={() => suspend(st.creator.id, st.creator.name)} disabled={busy} outline /></View>
              </View>
            </View>
          ))}
        </>
      )}

      {tab === 'payouts' && (
        <>
          <View style={s.row}>
            {P_STATUS.map((st) => (
              <Pressable key={st} onPress={() => setPStatus(st)} style={[s.chip, pStatus === st && s.chipOn]}>
                <Text style={[s.chipText, pStatus === st && { color: '#fff' }]}>{st}</Text>
              </Pressable>
            ))}
          </View>
          {payouts.length === 0 && <Text style={s.muted}>No {pStatus.toLowerCase()} requests.</Text>}
          {payouts.map((p) => (
            <View key={p.id} style={s.card}>
              <Text style={s.cardTitle}>{money(p.amountCents)} · 💎 {p.diamonds}</Text>
              <Text style={s.muted}>{p.user?.name} · {p.user?.email}</Text>
              <Text style={s.muted}>{p.method} → {p.destination}</Text>
              <Text style={s.muted}>{new Date(p.createdAt).toLocaleString()}</Text>
              {!!p.adminNote && <Text style={s.muted}>Note: {p.adminNote}</Text>}
              {(p.status === 'PENDING' || p.status === 'APPROVED') && (
                <View style={s.row}>
                  {p.status === 'PENDING' && <View style={s.cell}><Btn label="Approve" onPress={() => payoutAction(p.id, 'approve')} disabled={busy} /></View>}
                  {p.status === 'APPROVED' && <View style={s.cell}><Btn label="Mark paid" onPress={() => payoutAction(p.id, 'pay')} disabled={busy} /></View>}
                  <View style={s.cell}><Btn label="Reject" onPress={() => payoutAction(p.id, 'reject')} disabled={busy} outline /></View>
                </View>
              )}
            </View>
          ))}
        </>
      )}

      {tab === 'users' && (
        <>
          <View style={s.row}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Search name or email" placeholderTextColor={colors.muted}
              autoCapitalize="none" value={q} onChangeText={setQ} onSubmitEditing={() => act(async () => {})} />
            <View style={{ width: 90 }}><Btn label="Search" onPress={() => act(async () => {})} disabled={busy} /></View>
          </View>
          {users.length === 0 && <Text style={s.muted}>Type at least 2 characters and search.</Text>}
          {users.map((u) => (
            <View key={u.id} style={s.card}>
              <Text style={s.cardTitle}>{u.name} · {u.role}</Text>
              <Text style={s.muted}>{u.email}</Text>
              <Text style={s.muted}>Coins {u.coinBalance} · Diamonds {u.diamondBalance} · {u.ageVerified ? 'age verified' : u.ageDeclaredAt ? 'age self-confirmed' : 'age not confirmed'}</Text>
              {!!u.suspendedAt && <Text style={s.err}>Suspended: {u.suspendReason}</Text>}
              <View style={s.row}>
                <View style={s.cell}><Btn label="Grant coins" onPress={() => grant(u)} disabled={busy} outline /></View>
                {u.role !== 'ADMIN' && !u.suspendedAt && (
                  <View style={s.cell}><Btn label="Suspend" onPress={() => suspend(u.id, u.name)} disabled={busy} outline /></View>
                )}
                {!!u.suspendedAt && (
                  <View style={s.cell}><Btn label="Unsuspend" onPress={() => act(() => api(`/admin/users/${u.id}/unsuspend`, { method: 'POST', body: {} }))} disabled={busy} outline /></View>
                )}
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <View style={s.stat}>
    <Text style={s.statValue}>{value}</Text>
    <Text style={s.muted}>{label}</Text>
  </View>
);

const s = StyleSheet.create({
  wrap: { padding: 16, gap: 10, maxWidth: 560, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.peach, fontSize: 24, fontWeight: '800' },
  link: { color: colors.peach, fontWeight: '700', fontSize: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: colors.peach, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  chipOn: { backgroundColor: colors.peach },
  chipText: { color: colors.peach, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { backgroundColor: colors.card, borderRadius: 12, padding: 12, minWidth: 150, flexGrow: 1 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 6 },
  severe: { borderWidth: 1, borderColor: colors.error },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  cell: { minWidth: 110 },
  input: { backgroundColor: colors.card, color: colors.text, padding: 12, borderRadius: 10 },
  text: { color: colors.text },
  muted: { color: colors.muted },
  err: { color: colors.error },
});
