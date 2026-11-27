import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Btn from './Btn';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

const REASONS: [string, string][] = [
  ['NUDITY_SEXUAL', 'Nudity or sexual content'],
  ['HARASSMENT', 'Harassment or hate'],
  ['VIOLENCE', 'Violence or dangerous acts'],
  ['SELF_HARM', 'Self-harm'],
  ['UNDERAGE', 'Someone under 18'],
  ['ILLEGAL', 'Illegal activity'],
  ['SPAM', 'Spam or scam'],
  ['OTHER', 'Something else'],
];

export type ReportTarget = { mediaId?: string; targetUserId?: string; streamId?: string; messageId?: string };

export default function ReportDialog({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const close = () => { setReason(''); setDetails(''); setErr(''); setDone(false); onClose(); };

  const send = async () => {
    if (!reason) return setErr('Choose a reason');
    setBusy(true); setErr('');
    try {
      await api('/reports', { method: 'POST', body: { ...target, reason, details: details.trim() || undefined } });
      setDone(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={close}>
      <View style={s.backdrop}>
        <View style={s.card}>
          {done ? (
            <>
              <Text style={s.title}>Thanks for reporting</Text>
              <Text style={s.muted}>Our team will review it. You will get a notification with the outcome.</Text>
              <Btn label="Close" onPress={close} />
            </>
          ) : (
            <>
              <Text style={s.title}>Report</Text>
              <View style={s.chips}>
                {REASONS.map(([k, label]) => (
                  <Pressable key={k} onPress={() => setReason(k)} style={[s.chip, reason === k && s.chipOn]}>
                    <Text style={[s.chipText, reason === k && { color: '#fff' }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={s.input} placeholder="Details (optional)" placeholderTextColor={colors.muted}
                value={details} onChangeText={setDetails} maxLength={500} multiline />
              {!!err && <Text style={s.err}>{err}</Text>}
              <Btn label={busy ? 'Sending...' : 'Send report'} onPress={send} disabled={busy} />
              <Btn label="Cancel" onPress={close} outline />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 10, maxWidth: 480, width: '100%', alignSelf: 'center' },
  title: { color: colors.text, fontWeight: '800', fontSize: 18 },
  muted: { color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.peach, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.peach },
  chipText: { color: colors.peach, fontWeight: '700' },
  input: { backgroundColor: colors.bg, color: colors.text, padding: 12, borderRadius: 10, minHeight: 60 },
  err: { color: colors.error },
});