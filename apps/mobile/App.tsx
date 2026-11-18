import './src/lib/livekit-setup';
import React, { useEffect, useState } from 'react';
import { SafeAreaView, ActivityIndicator, View, StatusBar } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import AgeScreen from './src/screens/AgeScreen';
import HomeScreen from './src/screens/HomeScreen';
import RoomScreen from './src/screens/RoomScreen';
import EarningsScreen from './src/screens/EarningsScreen';
import PayoutsScreen from './src/screens/PayoutsScreen';
import AdminScreen from './src/screens/AdminScreen';
import ApplyScreen from './src/screens/ApplyScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import { api, setToken } from './src/lib/api';
import { storage } from './src/lib/storage';
import { registerForPush, unregisterPush, onNotificationTap } from './src/lib/push';
import { colors } from './src/lib/ui';

type Screen =
  | { name: 'boot' } | { name: 'login' } | { name: 'age' } | { name: 'home' }
  | { name: 'earnings' } | { name: 'payouts' } | { name: 'admin' } | { name: 'apply' }
  | { name: 'profile'; username: string }
  | { name: 'leaderboard' }
  | { name: 'room'; session: any };

const needsAge = (m: any) => !m.ageVerified && !m.ageDeclaredAt;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'boot' });
  const [me, setMe] = useState<any>(null);

  const afterLogin = async () => {
    const m = await api('/auth/me');
    setMe(m);
    if (needsAge(m)) { setScreen({ name: 'age' }); return; }
    setScreen({ name: 'home' });
    registerForPush().catch(() => {}); // asks for notification permission on phones
  };

  useEffect(() => {
    (async () => {
      const saved = storage.get('token');
      if (!saved) return setScreen({ name: 'login' });
      setToken(saved);
      try { await afterLogin(); } catch { setToken(null); storage.del('token'); setScreen({ name: 'login' }); }
    })();
  }, []);

  const watchStream = async (streamId: string) => {
    try {
      const r = await api(`/streams/${streamId}/join`, { method: 'POST' });
      setScreen({ name: 'room', session: { ...r, publish: false } });
    } catch { /* stream ended or not allowed: stay where we are */ }
  };

  // Tapping an "X is live" notification opens that stream
  useEffect(() => {
    if (!me) return;
    return onNotificationTap((d) => {
      if (d?.type === 'live' && d.streamId) watchStream(String(d.streamId));
    });
  }, [me?.id]);

  const logout = async () => {
    await unregisterPush();
    setToken(null); storage.del('token'); setMe(null); setScreen({ name: 'login' });
  };
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
      {screen.name === 'age' && <AgeScreen onDone={afterLogin} onLogout={logout} />}
      {screen.name === 'home' && (
        <HomeScreen
          onOpenRoom={(session) => setScreen({ name: 'room', session })}
          onOpenEarnings={() => setScreen({ name: 'earnings' })}
          onOpenPayouts={() => setScreen({ name: 'payouts' })}
          onOpenAdmin={() => setScreen({ name: 'admin' })}
          onOpenApply={() => setScreen({ name: 'apply' })}
          onOpenProfile={(username) => setScreen({ name: 'profile', username })}
          onOpenLeaderboard={() => setScreen({ name: 'leaderboard' })}
          onLogout={logout}
        />
      )}
      {screen.name === 'earnings' && <EarningsScreen onBack={home} />}
      {screen.name === 'payouts' && <PayoutsScreen onBack={home} />}
      {screen.name === 'admin' && <AdminScreen onBack={home} />}
      {screen.name === 'apply' && <ApplyScreen onBack={home} />}
      {screen.name === 'leaderboard' && <LeaderboardScreen onBack={home} onOpenProfile={(username) => setScreen({ name: 'profile', username })} />}
      {screen.name === 'profile' && <ProfileScreen username={screen.username} onBack={home} onWatch={watchStream} />}
      {screen.name === 'room' && <RoomScreen session={screen.session} me={me} onLeave={home} />}
    </SafeAreaView>
  );
}
