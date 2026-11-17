import './src/lib/livekit-setup';
import React, { useEffect, useState } from 'react';
import { SafeAreaView, ActivityIndicator, View, StatusBar } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import RoomScreen from './src/screens/RoomScreen';
import EarningsScreen from './src/screens/EarningsScreen';
import PayoutsScreen from './src/screens/PayoutsScreen';
import AdminScreen from './src/screens/AdminScreen';
import { api, setToken } from './src/lib/api';
import { storage } from './src/lib/storage';
import { colors } from './src/lib/ui';

type Screen =
  | { name: 'boot' } | { name: 'login' } | { name: 'home' }
  | { name: 'earnings' } | { name: 'payouts' } | { name: 'admin' }
  | { name: 'room'; session: any };

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
  const home = () => setScreen({ name: 'home' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle="light-content" />
      {screen.name === 'boot' && (
        <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.peach} /></View>
      )}
      {screen.name === 'login' && (
        <LoginScreen
          onLogin={async (t) => {
            setToken(t); storage.set('token', t);
            try { await afterLogin(); }
            catch (e) { setToken(null); storage.del('token'); throw e; }
          }}
        />
      )}
      {screen.name === 'home' && (
        <HomeScreen
          onOpenRoom={(session) => setScreen({ name: 'room', session })}
          onOpenEarnings={() => setScreen({ name: 'earnings' })}
          onOpenPayouts={() => setScreen({ name: 'payouts' })}
          onOpenAdmin={() => setScreen({ name: 'admin' })}
          onLogout={logout}
        />
      )}
      {screen.name === 'earnings' && <EarningsScreen onBack={home} />}
      {screen.name === 'payouts' && <PayoutsScreen onBack={home} />}
      {screen.name === 'admin' && <AdminScreen onBack={home} />}
      {screen.name === 'room' && <RoomScreen session={screen.session} me={me} onLeave={home} />}
    </SafeAreaView>
  );
}
