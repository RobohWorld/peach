import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/ui';

export type GiftEvent = { id: number; from: string; gift: string; emoji: string; coins: number };

function Effect({ ev, onDone }: { ev: GiftEvent; onDone: (id: number) => void }) {
  const t = useRef(new Animated.Value(0)).current;
  const tier = ev.coins >= 1000 ? 3 : ev.coins >= 200 ? 2 : 1;
  const drift = useRef((Math.random() - 0.5) * 160).current;

  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: tier === 3 ? 3600 : tier === 2 ? 2800 : 2200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => onDone(ev.id));
  }, []);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [40, tier === 1 ? -240 : -120] });
  const opacity = t.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [0, 1, 1, 0] });
  const peak = tier === 3 ? 3.2 : tier === 2 ? 2.2 : 1.3;
  const scale = t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.4, peak, peak * 1.1] });

  return (
    <Animated.View
      style={[s.effect, { opacity, transform: [{ translateX: tier === 1 ? drift : 0 }, { translateY }, { scale }] }]}
    >
      <Text style={s.emoji}>{ev.emoji}</Text>
      {tier >= 2 && (
        <Text style={s.banner}>{ev.from} sent {ev.gift}!</Text>
      )}
    </Animated.View>
  );
}

export default function GiftOverlay({ events, onDone }: { events: GiftEvent[]; onDone: (id: number) => void }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {events.map((ev) => <Effect key={ev.id} ev={ev} onDone={onDone} />)}
    </View>
  );
}

const s = StyleSheet.create({
  effect: { position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' },
  emoji: { fontSize: 56 },
  banner: {
    color: '#fff', backgroundColor: colors.peach, fontWeight: '800',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', marginTop: 6,
  },
});
