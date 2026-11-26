import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Image, Pressable, StyleSheet } from 'react-native';
import Btn from './Btn';
import MediaViewer from './MediaViewer';
import ReportDialog from './ReportDialog';
import { api } from '../lib/api';
import { pickMedia, uploadMedia, Picked, MAX_VIDEO_SECONDS } from '../lib/mediaUpload';
import { colors } from '../lib/ui';

const fmt = (n: number) => n.toLocaleString('en-US');
const TIER_NAMES = ['', 'Fan', 'Supporter', 'VIP'];

// Photos and videos on a creator profile. Visitors can unlock items with coins;
// the creator sees their own items, upload form and sales.
export default function CreatorMedia({ username, isMe }: { username: string; isMe: boolean }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [viewing, setViewing] = useState<any>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Report dialog state
  const [reporting, setReporting] = useState<string | null>(null);

  // Upload form (creator only)
  const [picked, setPicked] = useState<Picked | null>(null);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [tier, setTier] = useState(0);
  const [step, setStep] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await api(`/creators/${encodeURIComponent(username)}/media`));
      setErr('');
    } catch (e: any) {
      setErr(e.message);
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  const unlock = async (it: any) => {
    setBusyId(it.id);
    setErr('');

    try {
      await api(`/media/${it.id}/purchase`, { method: 'POST' });
      setConfirmId(null);
      await load();
      setViewing(it);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (it: any) => {
    setBusyId(it.id);
    setErr('');

    try {
      await api(`/media/${it.id}/delete`, { method: 'POST' });
      setRemoveId(null);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const choose = async () => {
    setErr('');
    setNote('');

    try {
      const p = await pickMedia();
      if (p) setPicked(p);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const upload = async () => {
    if (!picked) return;

    const coins = price.trim() === '' ? null : Number(price);

    if (!title.trim()) return setErr('Add a title');

    if (coins !== null && (!Number.isInteger(coins) || coins < 1)) {
      return setErr('Price must be a whole number of coins, at least 1');
    }

    if (coins === null && tier === 0) {
      return setErr('Set a price, choose a subscriber tier, or both');
    }

    setErr('');
    setNote('');

    try {
      const r = await uploadMedia(
        picked,
        title.trim(),
        coins,
        tier === 0 ? null : tier,
        setStep
      );

      setPicked(null);
      setTitle('');
      setPrice('');
      setTier(0);

      setNote(
        r.status === 'PENDING'
          ? 'Uploaded. It will appear after review.'
          : 'Uploaded and live.'
      );

      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setStep('');
    }
  };

  const busyUpload = !!step;

  return (
    <View style={s.wrap}>
      <Text style={s.section}>Photos and videos</Text>

      {!!err && <Text style={s.err}>{err}</Text>}
      {!!note && <Text style={s.ok}>{note}</Text>}

      {isMe && (
        <View style={s.card}>
          {!picked ? (
            <Btn label="Upload photo or video" onPress={choose} />
          ) : (
            <>
              <Text style={s.text}>
                {picked.kind === 'VIDEO'
                  ? `Video, ${picked.durationSec}s (max ${MAX_VIDEO_SECONDS}s)`
                  : 'Photo'} selected
              </Text>

              <TextInput
                style={s.input}
                placeholder="Title"
                placeholderTextColor={colors.muted}
                value={title}
                onChangeText={setTitle}
                maxLength={80}
              />

              <TextInput
                style={s.input}
                placeholder="Price in coins (leave empty for subscribers only)"
                placeholderTextColor={colors.muted}
                value={price}
                onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={6}
              />

              <Text style={s.muted}>
                Included for subscribers at this tier or higher:
              </Text>

              <View style={s.chips}>
                {[0, 1, 2, 3].map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setTier(t)}
                    style={[s.chip, tier === t && s.chipOn]}
                  >
                    <Text
                      style={[
                        s.chipText,
                        tier === t && { color: '#fff' },
                      ]}
                    >
                      {t === 0 ? 'None' : `${TIER_NAMES[t]}+`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Btn
                label={busyUpload ? step : 'Upload'}
                onPress={upload}
                disabled={busyUpload}
              />

              <Btn
                label="Cancel"
                onPress={() => setPicked(null)}
                outline
                disabled={busyUpload}
              />
            </>
          )}
        </View>
      )}

      {items === null && !err && (
        <Text style={s.muted}>Loading...</Text>
      )}

      {items?.length === 0 && (
        <Text style={s.muted}>
          {isMe
            ? 'You have not uploaded anything yet.'
            : 'No photos or videos yet.'}
        </Text>
      )}

      <View style={s.grid}>
        {items?.map((it) => (
          <View key={it.id} style={s.item}>
            <Pressable
              disabled={!it.owned}
              onPress={() => setViewing(it)}
              style={s.preview}
            >
              {it.previewUrl ? (
                <Image
                  source={{ uri: it.previewUrl }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  blurRadius={it.owned ? 0 : 10}
                />
              ) : (
                <Text style={s.big}>🎬</Text>
              )}

              {!it.owned && (
                <View style={s.lock}>
                  <Text style={s.lockText}>
                    🔒 {it.priceCoins
                      ? `${fmt(it.priceCoins)} 🪙`
                      : `${TIER_NAMES[it.minTier ?? 1]}+`}
                  </Text>
                </View>
              )}

              {it.owned && (
                <View style={s.lock}>
                  <Text style={s.lockText}>Tap to view</Text>
                </View>
              )}

              {it.type === 'VIDEO' && !!it.durationSec && (
                <Text style={s.dur}>{it.durationSec}s</Text>
              )}
            </Pressable>

            <Text style={s.name} numberOfLines={1}>
              {it.title}
            </Text>

            {isMe ? (
              <>
                <Text style={s.muted}>
                  {it.priceCoins
                    ? `${fmt(it.priceCoins)} 🪙`
                    : 'Subscribers only'}
                  {it.minTier
                    ? ` · ${TIER_NAMES[it.minTier]}+`
                    : ''}
                  {' · '}
                  {it.sales} sold
                  {it.status === 'PENDING'
                    ? ' · awaiting review'
                    : it.status === 'FLAGGED'
                    ? ' · hidden, under review'
                    : ''}
                </Text>

                {removeId === it.id ? (
                  <View style={{ gap: 6 }}>
                    <Text style={s.muted}>
                      Remove this item? Buyers lose access.
                    </Text>

                    <Btn
                      label="Remove"
                      onPress={() => remove(it)}
                      disabled={busyId === it.id}
                    />

                    <Btn
                      label="Keep"
                      onPress={() => setRemoveId(null)}
                      outline
                    />
                  </View>
                ) : (
                  <Pressable onPress={() => setRemoveId(it.id)}>
                    <Text style={s.link}>Remove</Text>
                  </Pressable>
                )}
              </>
            ) : !it.owned && !it.priceCoins ? (
              <Text style={s.muted}>
                Subscribe to {TIER_NAMES[it.minTier ?? 1]} or higher to view.
              </Text>
            ) : !it.owned ? (
              confirmId === it.id ? (
                <View style={{ gap: 6 }}>
                  <Text style={s.muted}>
                    Spend {fmt(it.priceCoins ?? 0)} coins?
                  </Text>

                  <Btn
                    label="Yes, unlock"
                    onPress={() => unlock(it)}
                    disabled={busyId === it.id}
                  />

                  <Btn
                    label="Cancel"
                    onPress={() => setConfirmId(null)}
                    outline
                  />
                </View>
              ) : (
                <View style={{ gap: 4 }}>
                  <Btn
                    label={`Unlock · ${fmt(it.priceCoins ?? 0)}`}
                    onPress={() => setConfirmId(it.id)}
                  />

                  {!!it.minTier && (
                    <Text style={s.muted}>
                      Or subscribe to {TIER_NAMES[it.minTier]}+
                    </Text>
                  )}
                </View>
              )
            ) : null}

            {/* Visitors can report media */}
            {!isMe && (
              <Pressable onPress={() => setReporting(it.id)}>
                <Text style={s.link}>Report</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>

      <MediaViewer
        item={viewing}
        onClose={() => setViewing(null)}
      />

      <ReportDialog
        target={reporting ? { mediaId: reporting } : null}
        onClose={() => setReporting(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  section: { color: colors.text, fontWeight: '700', fontSize: 18 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 10 },
  input: { backgroundColor: colors.bg, color: colors.text, padding: 12, borderRadius: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.peach, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  chipOn: { backgroundColor: colors.peach },
  chipText: { color: colors.peach, fontWeight: '700' },
  item: { width: '48%', backgroundColor: colors.card, borderRadius: 12, padding: 8, gap: 6 },
  preview: { height: 140, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2c2438', alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 36 },
  lock: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  lockText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  dur: { position: 'absolute', top: 6, right: 6, color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 6, fontSize: 11, overflow: 'hidden' },
  name: { color: colors.text, fontWeight: '700' },
  text: { color: colors.text },
  muted: { color: colors.muted, fontSize: 12 },
  link: { color: colors.peach, fontWeight: '700', fontSize: 12 },
  err: { color: colors.error },
  ok: { color: '#4cc38a' },
});
