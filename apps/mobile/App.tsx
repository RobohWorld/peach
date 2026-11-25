import './src/lib/livekit-setup';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { useKeyboardVisible } from './src/lib/useKeyboardVisible';

import LoginScreen from './src/screens/LoginScreen';
import AgeScreen from './src/screens/AgeScreen';
import HomeScreen from './src/screens/HomeScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import GoLiveScreen from './src/screens/GoLiveScreen';
import ChatScreen from './src/screens/ChatScreen';
import MeScreen from './src/screens/MeScreen';
import WalletScreen from './src/screens/WalletScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import SubscriptionsScreen from './src/screens/SubscriptionsScreen';
import RoomScreen from './src/screens/RoomScreen';
import EarningsScreen from './src/screens/EarningsScreen';
import PayoutsScreen from './src/screens/PayoutsScreen';
import AdminScreen from './src/screens/AdminScreen';
import ApplyScreen from './src/screens/ApplyScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';

import TabBar, { Tab } from './src/components/TabBar';

import { api, setToken } from './src/lib/api';
import { storage } from './src/lib/storage';
import {
  registerForPush,
  unregisterPush,
  onNotificationTap,
} from './src/lib/push';
import { colors } from './src/lib/ui';

type Screen =
  | { name: 'boot' }
  | { name: 'login' }
  | { name: 'age' }
  | { name: 'home' }
  | { name: 'earnings' }
  | { name: 'payouts' }
  | { name: 'admin' }
  | { name: 'apply' }
  | { name: 'wallet' }
  | { name: 'library' }
  | { name: 'subscriptions' }
  | { name: 'profile'; username: string }
  | { name: 'leaderboard' }
  | { name: 'room'; session: any };

const needsAge = (m: any) => !m.ageVerified && !m.ageDeclaredAt;

function Shell() {
  const insets = useSafeAreaInsets();
  const kbOpen = useKeyboardVisible();

  const [screen, setScreen] = useState<Screen>({ name: 'boot' });
  const [tab, setTab] = useState<Tab>('home');
  const [me, setMe] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  const [chatTarget, setChatTarget] = useState<string | null>(null);

  const onTabs = screen.name === 'home';

  const afterLogin = async () => {
    const m = await api('/auth/me');
    setMe(m);

    if (needsAge(m)) {
      setScreen({ name: 'age' });
      return;
    }

    setScreen({ name: 'home' });
    registerForPush().catch(() => {});
  };

  useEffect(() => {
    (async () => {
      const saved = storage.get('token');

      if (!saved) return setScreen({ name: 'login' });

      setToken(saved);

      try {
        await afterLogin();
      } catch {
        setToken(null);
        storage.del('token');
        setScreen({ name: 'login' });
      }
    })();
  }, []);

  const watchStream = async (streamId: string) => {
    try {
      const r = await api(`/streams/${streamId}/join`, {
        method: 'POST',
      });

      setScreen({
        name: 'room',
        session: { ...r, publish: false },
      });
    } catch {
      // Stream ended or not allowed: stay where we are.
    }
  };

  // Tapping a notification: live opens the stream.
  // Chat and friend alerts open the Chat tab.
  useEffect(() => {
    if (!me) return;

    return onNotificationTap((d) => {
      if (d?.type === 'live' && d.streamId) {
        watchStream(String(d.streamId));
      } else if (d?.type === 'chat' || d?.type === 'friend') {
        setTab('chat');
        setChatTarget(
          d.friendshipId ? String(d.friendshipId) : null
        );
        setScreen({ name: 'home' });
      }
    });
  }, [me?.id]);

  // Chat tab badge: poll while the tab bar is on screen.
  useEffect(() => {
    if (!me || screen.name !== 'home') return;

    let stop = false;

    const load = () =>
      api('/chat/unread')
        .then((r) => {
          if (!stop) setUnread(Number(r?.total) || 0);
        })
        .catch(() => {});

    load();

    const t = setInterval(load, 10000);

    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [me?.id, screen.name, tab]);

  const clearChatTarget = useCallback(
    () => setChatTarget(null),
    []
  );

  const logout = async () => {
    await unregisterPush();

    setToken(null);
    storage.del('token');
    setMe(null);
    setTab('home');
    setUnread(0);
    setScreen({ name: 'login' });
  };

  // Back from any sub-screen returns to the tab the user was on.
  const home = () => setScreen({ name: 'home' });

  const openProfile = (username: string) =>
    setScreen({ name: 'profile', username });

  const openRoom = (session: any) =>
    setScreen({ name: 'room', session });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior="padding"
    >
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom: onTabs || kbOpen ? 0 : insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <StatusBar style="light" />

        {screen.name === 'boot' && (
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator color={colors.peach} />
          </View>
        )}

        {screen.name === 'login' && (
          <LoginScreen
            onLogin={async (t) => {
              setToken(t);
              storage.set('token', t);

              try {
                await afterLogin();
              } catch (e) {
                setToken(null);
                storage.del('token');
                throw e;
              }
            }}
          />
        )}

        {screen.name === 'age' && (
          <AgeScreen
            onDone={afterLogin}
            onLogout={logout}
          />
        )}

        {screen.name === 'home' && (
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1 }}>
              {tab === 'home' && (
                <HomeScreen
                  onOpenRoom={openRoom}
                  onOpenProfile={openProfile}
                />
              )}

              {tab === 'explore' && (
                <ExploreScreen
                  onOpenProfile={openProfile}
                  onOpenLeaderboard={() =>
                    setScreen({ name: 'leaderboard' })
                  }
                />
              )}

              {tab === 'live' && (
                <GoLiveScreen
                  onOpenRoom={openRoom}
                  onOpenApply={() =>
                    setScreen({ name: 'apply' })
                  }
                />
              )}

              {tab === 'chat' && me && (
                <ChatScreen
                  meId={me.id}
                  openFriendshipId={chatTarget}
                  onOpened={clearChatTarget}
                />
              )}

              {tab === 'me' && (
                <MeScreen
                  onOpenWallet={() =>
                    setScreen({ name: 'wallet' })
                  }
                  onOpenLibrary={() =>
                    setScreen({ name: 'library' })
                  }
                  onOpenSubscriptions={() =>
                    setScreen({ name: 'subscriptions' })
                  }
                  onOpenEarnings={() =>
                    setScreen({ name: 'earnings' })
                  }
                  onOpenPayouts={() =>
                    setScreen({ name: 'payouts' })
                  }
                  onOpenAdmin={() =>
                    setScreen({ name: 'admin' })
                  }
                  onOpenApply={() =>
                    setScreen({ name: 'apply' })
                  }
                  onOpenProfile={openProfile}
                  onLogout={logout}
                />
              )}
            </View>

            <TabBar
              tab={tab}
              onChange={setTab}
              badges={{ chat: unread }}
            />
          </View>
        )}

        {screen.name === 'wallet' && (
          <WalletScreen onBack={home} />
        )}

        {screen.name === 'library' && (
          <LibraryScreen onBack={home} />
        )}

        {screen.name === 'subscriptions' && (
          <SubscriptionsScreen
            onBack={home}
            onOpenProfile={openProfile}
          />
        )}

        {screen.name === 'earnings' && (
          <EarningsScreen onBack={home} />
        )}

        {screen.name === 'payouts' && (
          <PayoutsScreen onBack={home} />
        )}

        {screen.name === 'admin' && (
          <AdminScreen onBack={home} />
        )}

        {screen.name === 'apply' && (
          <ApplyScreen onBack={home} />
        )}

        {screen.name === 'leaderboard' && (
          <LeaderboardScreen
            onBack={home}
            onOpenProfile={openProfile}
          />
        )}

        {screen.name === 'profile' && (
          <ProfileScreen
            username={screen.username}
            onBack={home}
            onWatch={watchStream}
          />
        )}

        {screen.name === 'room' && (
          <RoomScreen
            session={screen.session}
            me={me}
            onLeave={home}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}