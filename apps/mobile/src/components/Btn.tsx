import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../lib/ui';

export default function Btn({ label, onPress, disabled, outline }: {
  label: string; onPress: () => void; disabled?: boolean; outline?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[s.btn, outline && s.outline, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.text, outline && { color: colors.peach }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { backgroundColor: colors.peach, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.peach },
  text: { color: '#fff', fontWeight: '700' },
});
