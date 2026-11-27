import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ITEMS, Tab } from './TabBar';
import { tap } from '../lib/haptics';
import { colors } from '../lib/ui';

export default function SideNav({ tab, onChange, badges }: {
  tab: Tab; onChange: (t: Tab) => void; badges?: Partial<Record<Tab, number>>;
}) {
  return (
    <View style={s.nav}>
      <Text style={s.logo}>🍑</Text>
      {ITEMS.map((it) => {
        const on = tab === it.key;
        const badge = badges?.[it.key] ?? 0;
        return (
          <Pressable key={it.key} onPress={() => { tap(); onChange(it.key); }}
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={it.label}
            style={[s.item, on && s.itemOn]}>
            <Text style={s.icon}>{it.icon}</Text>
            <Text style={[s.label, on && s.labelOn]} maxFontSizeMultiplier={1.2}>{it.label}</Text>
            {badge > 0 && <View style={s.badge}><Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  nav: { width: 96, backgroundColor: colors.card, paddingVertical: 12, gap: 6, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#2c2438' },
  logo: { fontSize: 26, marginBottom: 8 },
  item: { width: 80, minHeight: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
  itemOn: { backgroundColor: '#3a2a3a' },
  icon: { fontSize: 22 },
  label: { color: colors.muted, fontSize: 11 },
  labelOn: { color: colors.peach, fontWeight: '700' },
  badge: { position: 'absolute', top: 6, right: 10, backgroundColor: colors.peach, borderRadius: 9, minWidth: 18, paddingHorizontal: 4, alignItems: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});