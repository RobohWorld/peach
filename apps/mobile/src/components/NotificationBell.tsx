import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

export default function NotificationBell({ onPress }: { onPress: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let stop = false;
    const load = () => api('/me/notifications/unread-count')
      .then((r) => { if (!stop) setN(Number(r?.count) || 0); }).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return (
    <Pressable onPress={onPress} hitSlop={8} style={s.btn} accessibilityRole="button"
      accessibilityLabel={n ? `Notifications, ${n} unread` : 'Notifications'}>
      <Text style={{ fontSize: 18 }}>🔔</Text>
      {n > 0 && (
        <View style={s.badge}><Text style={s.badgeText}>{n > 9 ? '9+' : n}</Text></View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});