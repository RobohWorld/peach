
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardVisible } from '../lib/useKeyboardVisible';
import { colors } from '../lib/ui';

export type Tab = 'home' | 'explore' | 'live' | 'chat' | 'me';

const ITEMS: { key: Tab; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '🏠' },
  { key: 'explore', label: 'Explore', icon: '🔎' },
  { key: 'live', label: 'Go Live', icon: '🎥' },
  { key: 'chat', label: 'Chat', icon: '💬' },
  { key: 'me', label: 'Me', icon: '👤' },
];

export default function TabBar({
  tab,
  onChange,
  badges,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  badges?: Partial<Record<Tab, number>>;
}) {
  const insets = useSafeAreaInsets();
  const kbOpen = useKeyboardVisible();

  // Don't float the tab bar above the keyboard.
  if (kbOpen) return null;

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {ITEMS.map((it) => {
        const on = tab === it.key;
        const center = it.key === 'live';
        const badge = badges?.[it.key] ?? 0;

        return (
          <Pressable
            key={it.key}
            onPress={() => onChange(it.key)}
            style={s.item}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={it.label}
          >
            <View style={[s.iconWrap, center && s.center, center && on && s.centerOn]}>
              <Text style={[s.icon, !on && !center && { opacity: 0.55 }]}>
                {it.icon}
              </Text>

              {badge > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>
                    {badge > 99 ? '99+' : badge}
                  </Text>
                </View>
              )}
            </View>

            <Text style={[s.label, on && s.labelOn]}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#2c2438',
  },
  item: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconWrap: {
    height: 32,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  center: {
    backgroundColor: '#3a2a3a',
    paddingHorizontal: 14,
  },
  centerOn: {
    backgroundColor: colors.peach,
  },
  icon: {
    fontSize: 20,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
  },
  labelOn: {
    color: colors.peach,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    backgroundColor: colors.peach,
    borderRadius: 9,
    minWidth: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
});
