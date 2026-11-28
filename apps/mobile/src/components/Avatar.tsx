import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const PALETTE = ['#ff7a59', '#8e5bd6', '#2f9e8f', '#d6568e', '#4a7bd6', '#c9923a'];

export const avatarColor = (name: string) =>
  PALETTE[Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

/** Google profile photos come as tiny 96px images. Ask for a bigger one. */
export function bigAvatar(url?: string | null, size = 400): string | null {
  if (!url) return null;
  return url.replace(/=s\d+-c/, `=s${size}-c`);
}

export default function Avatar({
  name,
  uri,
  size = 40,
}: {
  name?: string | null;
  uri?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const label = (name ?? '').trim() || '?';
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return <Image source={{ uri }} style={[box, s.img]} onError={() => setFailed(true)} />;
  }

  return (
    <View style={[box, s.fallback, { backgroundColor: avatarColor(label) }]}>
      <Text style={[s.letter, { fontSize: size * 0.42 }]}>{label.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  img: { backgroundColor: '#2c2438' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontWeight: '800' },
});
