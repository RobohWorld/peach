import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { avatarColor, bigAvatar } from './Avatar';
import { flag } from '../lib/countries';

// Picture card: creator photo fills the card.
// Top-left: current viewers. Top-right: LIVE. Bottom-right: name and country flag.
export default function LiveCard({
  stream,
  width,
  busy,
  onPress,
}: {
  stream: any;
  width: number;
  busy?: boolean;
  onPress: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const name: string = stream.creator?.name ?? 'Live';
  const uri = bigAvatar(stream.creator?.avatarUrl);
  const fl = flag(stream.creator?.country);

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${stream.viewers ?? 0} watching. ${stream.title ?? ''}`}
      style={({ pressed }) => [s.card, { width, height: Math.round(width * 1.25) }, pressed && { opacity: 0.85 }]}
    >
      {uri && !failed ? (
        <Image source={{ uri }} style={s.fill} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <View style={[s.fill, s.center, { backgroundColor: avatarColor(name) }]}>
          <Text style={s.initial}>{name.charAt(0).toUpperCase()}</Text>
        </View>
      )}

      <View style={s.shadeSoft} />
      <View style={s.shade} />

      <View style={s.viewers}>
        <Text style={s.viewersText} maxFontSizeMultiplier={1.2}>
          👁 {Number(stream.viewers ?? 0).toLocaleString()}
        </Text>
      </View>

      <View style={s.live}>
        <View style={s.liveDot} />
        <Text style={s.liveText} maxFontSizeMultiplier={1.2}>LIVE</Text>
      </View>

      <View style={s.bottom}>
        {!!stream.title && (
          <Text style={s.title} numberOfLines={1}>{stream.title}</Text>
        )}
        <Text style={s.name} numberOfLines={1}>
          {name}
          {fl ? `  ${fl}` : ''}
        </Text>
      </View>

      {busy && (
        <View style={[StyleSheet.absoluteFill, s.center, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#201a2b' },
  fill: { ...StyleSheet.absoluteFill },
  center: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: 'rgba(255,255,255,0.9)', fontSize: 64, fontWeight: '800' },
  shadeSoft: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', backgroundColor: 'rgba(0,0,0,0.22)' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '32%', backgroundColor: 'rgba(0,0,0,0.38)' },
  viewers: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
  },
  viewersText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  live: {
    position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#e5384f', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  bottom: { position: 'absolute', left: 10, right: 10, bottom: 8, alignItems: 'flex-end', gap: 1 },
  title: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  name: { color: '#fff', fontSize: 14, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
});
