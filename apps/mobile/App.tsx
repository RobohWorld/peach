import React, { useEffect, useState } from 'react';
import { SafeAreaView, ActivityIndicator, View, StatusBar } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import RoomScreen from './src/screens/RoomScreen';
import EarningsScreen from './src/screens/EarningsScreen';
import { api, setToken } from './src/lib/api';
import { storage } from './src/lib/storage';
import { colors } from './src/lib/ui';

type Screen =
  | { name: 'boot' } | { name: 'login' } | { name: 'home' }
  | { name: 'earnings' } | { name: 'room'; session: any };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'boot' });
  const [me, setMe] = useState<any>(null);

  const afterLogin = async () => {
    const m = await api('/auth/me');
    setMe(m);
    setScreen({ name: 'home' });
  };

  useEffect(() => {
    (async () => {
      const saved = storage.get('token');
      if (!saved) return setScreen({ name: 'login' });
      setToken(saved);
      try { await afterLogin(); } catch { setToken(null); storage.del('token'); setScreen({ name: 'login' }); }
    })();
  }, []);

  const logout = () => { setToken(null); storage.del('token'); setMe(null); setScreen({ name: 'login' }); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="light-content" />
      {screen.name === 'boot' && (
        <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.peach} /></View>
      )}
      {screen.name === 'login' && (
        <LoginScreen onLogin={async (t) => { setToken(t); storage.set('token', t); await afterLogin(); }} />
      )}
      {screen.name === 'home' && (
        <HomeScreen
          onOpenRoom={(session) => setScreen({ name: 'room', session })}
          onOpenEarnings={() => setScreen({ name: 'earnings' })}
          onLogout={logout}
        />
      )}
      {screen.name === 'earnings' && <EarningsScreen onBack={() => setScreen({ name: 'home' })} />}
      {screen.name === 'room' && (
        <RoomScreen session={screen.session} me={me} onLeave={() => setScreen({ name: 'home' })} />
      )}
    </SafeAreaView>
  );
}
