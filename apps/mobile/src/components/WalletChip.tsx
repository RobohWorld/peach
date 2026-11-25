import React, { useEffect, useState } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { api } from '../lib/api';
import { colors } from '../lib/ui';

export default function WalletChip({ onPress }: { onPress: () => void }) {
  const [coins, setCoins] = useState<number | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () =>
      api('/wallet')
        .then((w) => { if (!stop) setCoins(Number(w.coinBalance)); })
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  return (
    <Pressable onPress={onPress} style={s.chip} hitSlop={8}
      accessibilityRole="button" accessibilityLabel="Open wallet">
      <Text style={s.text}>🪙 {coins === null ? '…' : coins.toLocaleString()}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: {
    backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: '#2c2438',
    paddingHorizontal: 12, paddingVertical: 6, minHeight: 32, justifyContent: 'center',
  },
  text: { color: colors.text, fontWeight: '700' },
});