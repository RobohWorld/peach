import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../lib/ui';

// Placeholder until Phase 2B (friends + text chat).
export default function ChatScreen() {
  return (
    <View style={s.wrap}>
      <Text style={s.title}>Chat is coming soon</Text>
      <Text style={s.muted}>
        You will be able to add friends and message them here. Chat opens once a friend request is accepted.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 8, alignItems: 'center' },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  muted: { color: colors.muted, textAlign: 'center', maxWidth: 360 },
});
