import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../lib/ui';

export type Tab = 'home' | 'explore' | 'live' | 'chat' | 'me';

const ITEMS: { key: Tab; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'explore', label: 'Explore', icon: '🔎' },
  { key: 'live', label: 'Go Live', icon: '🎥' },
  { key: 'chat', label: 'Chat', icon: '💬' },
  { key: 'me', label: 'Me', icon: '👤' },
];

export default function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={s.bar}>
      {ITEMS.map((it) => {
        const on = tab === it.key;
        const center = it.key === 'live';
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} style={s.item}
            accessibilityRole="button" accessibilityLabel={it.label}>
            <View style={[s.iconWrap, center && s.center, center && on && s.centerOn]}>
              <Text style={[s.icon, !on && !center && { opacity: 0.55 }]}>{it.icon}</Text>
            </View>
            <Text style={[s.label, on && s.labelOn]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: colors.card, paddingTop: 6, paddingBottom: 8,
    borderTopWidth: 1, borderTopColor: '#2c2438',
  },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  iconWrap: { height: 32, minWidth: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  center: { backgroundColor: '#3a2a3a', paddingHorizontal: 14 },
  centerOn: { backgroundColor: colors.peach },
  icon: { fontSize: 20 },
  label: { color: colors.muted, fontSize: 11 },
  labelOn: { color: colors.peach, fontWeight: '700' },
});
