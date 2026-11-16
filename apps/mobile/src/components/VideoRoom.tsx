import React from 'react';
import { View, Text } from 'react-native';

type Props = {
  url: string; token: string; publish: boolean;
  onMessage: (m: any) => void;
  registerSender: (fn: (m: any) => void) => void;
};

export default function VideoRoom(_: Props) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', padding: 16 }}>
      <Text style={{ color: '#fff', textAlign: 'center' }}>
        Live video on iOS/Android needs a custom dev build (next step). Use the web version for now.
      </Text>
    </View>
  );
}
