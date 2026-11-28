import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../lib/ui';
import { COUNTRIES, flag } from '../lib/countries';

export default function CountryPicker({
  visible,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  selected?: string | null;
  onPick: (cc: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const list = term
    ? COUNTRIES.filter(([cc, name]) => name.toLowerCase().includes(term) || cc.toLowerCase() === term)
    : COUNTRIES;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>Your country</Text>
          <TextInput
            style={s.input}
            placeholder="Search"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
          />
          <FlatList
            data={list}
            keyExtractor={(i) => i[0]}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={[s.row, selected === item[0] && s.rowOn]}
                onPress={() => { setQ(''); onPick(item[0]); }}
                accessibilityRole="button"
              >
                <Text style={s.flag}>{flag(item[0])}</Text>
                <Text style={s.name}>{item[1]}</Text>
              </Pressable>
            )}
          />
          <Pressable onPress={() => { setQ(''); onClose(); }} style={s.cancel} accessibilityRole="button">
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: '#1b1524', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, gap: 10, maxHeight: '80%', maxWidth: 520, width: '100%', alignSelf: 'center',
  },
  title: { color: colors.text, fontWeight: '800', fontSize: 18 },
  input: { backgroundColor: colors.bg, color: colors.text, padding: 12, borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10 },
  rowOn: { backgroundColor: colors.card },
  flag: { fontSize: 24 },
  name: { color: colors.text, fontSize: 16 },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: colors.peach, fontWeight: '700' },
});
