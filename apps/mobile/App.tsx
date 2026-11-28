import './src/lib/livekit-setup';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Image,
  KeyboardAvoidingView,
  BackHandler,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { useKeyboardVisible } from './src/lib/useKeyboardVisible';
import { useLayout } from './src/lib/useLayout';

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
import NotificationsScreen from './src/screens/NotificationsScreen';

import TabBar, { Tab } from './src/components/TabBar';
import SideNav from './src/components/SideNav';

import { api, setToken } from './src/lib/api';
import { storage } from './src/lib/storage';
import { setCacheScope } from './src/lib/cache';

import {
  registerForPush,
  unregisterPush,
  onNotificationTap,
} from './src/lib/push';

import { colors } from './src/lib/ui';
import GuidelinesScreen from './src/screens/GuidelinesScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

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
  | { name: 'room'; session: any }
  | { name: 'notifications' }
   | { name: 'rules' }
  | { name: 'guidelines' };

const needsAge = (m: any) => !m.ageVerified && !m.ageDeclaredAt;

function Shell() {
  const hideNativeSplash = useCallback(() => {
  SplashScreen.hideAsync().catch(() => {});
}, []);
  const insets = useSafeAreaInsets();
  const kbOpen = useKeyboardVisible();
  const L = useLayout();

  const [screen, setScreen] = useState<Screen>({ name: 'boot' });
  const [tab, setTab] = useState<Tab>('home');
  const [me, setMe] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  const [chatTarget, setChatTarget] = useState<string | null>(null);

  const onTabs = screen.name === 'home';

  const afterLogin = async () => {
    const m = await api('/auth/me');
    setCacheScope(m.id); // saved screen data belongs to this user only
    setMe(m);

    if (needsAge(m)) {
      setScreen({ name: 'age' });
      return;
    }
     if (!m.rulesAccepted) {
      setScreen({ name: 'rules' });
      return;
    }

    setScreen({ name: 'home' });
    registerForPush().catch(() => {});
  };

  useEffect(() => {
    (async () => {
      const saved = storage.get('token');

      if (!saved) {
        return setScreen({ name: 'login' });
      }

      setToken(saved);

      for (let attempt = 0; ; attempt++) {
        try {
          await afterLogin();
          return;
        } catch (e: any) {
          if (e?.status === 401 || e?.status === 403) {
            setToken(null);
            storage.del('token');
            return setScreen({ name: 'login' });
          }

          if (attempt >= 2) {
            return setScreen({ name: 'login' });
          }

          await new Promise((r) => setTimeout(r, 1500));
        }
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

  const openNotification = (d: any) => {
    if (d?.type === 'live' && d.streamId) {
      watchStream(String(d.streamId));
    } else if (d?.type === 'friend' || d?.type === 'chat') {
      setTab('chat');
      setScreen({ name: 'home' });
    } else if (d?.type === 'refund') {
      setScreen({ name: 'wallet' });
    } else if (d?.username) {
      openProfile(String(d.username));
    }
  };

  // Tapping a notification: live opens the stream.
  // Chat and friend alerts open the Chat tab.
  useEffect(() => {
    if (!me) return;

    return onNotificationTap((d) => {
      if (d?.type === 'live' && d.streamId) {
        watchStream(String(d.streamId));
      } else if (
        d?.type === 'chat' ||
        d?.type === 'friend'
      ) {
        setTab('chat');

        setChatTarget(
          d.friendshipId ? String(d.friendshipId) : null
        );

        setScreen({ name: 'home' });
      } else if (d?.type === 'refund') {
        setScreen({ name: 'wallet' });
      } else if (d?.username) {
        openProfile(String(d.username));
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
    setCacheScope(null);
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

  // "Message" button inside a live room: open that conversation in the Chat tab.
  const openChat = (friendshipId: string) => {
    setTab('chat');
    setChatTarget(friendshipId);
    setScreen({ name: 'home' });
  };

  // Android hardware back button.
  useEffect(() => {
    const sub = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (screen.name === 'home') {
          if (tab !== 'home') {
            setTab('home');
            return true;
          }

          return false;
        }

        if (
          ['boot', 'login', 'age', 'rules', 'room'].includes(screen.name)
        ) {
          return false;
        }

        home();
        return true;
      }
    );

    return () => sub.remove();
  }, [screen.name, tab]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior="padding"
    >
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom:
            (onTabs && !L.wide) || kbOpen
              ? 0
              : insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <StatusBar style="light" />

   {screen.name === 'boot' && (
  <View
    onLayout={hideNativeSplash}
    style={{
      position: 'absolute',
      top: -insets.top,
      bottom: -insets.bottom,
      left: -insets.left,
      right: -insets.right,
      backgroundColor: '#302477',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      elevation: 1000,
    }}
  >
    <Image
      source={require('./assets/splash-icon.png')}
      style={{
        width: '100%',
        height: '100%',
      }}
      resizeMode="contain"
    />
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

        {screen.name === 'rules' && (
  <GuidelinesScreen
    onAccept={async () => {
      await api('/auth/accept-rules', { method: 'POST', body: { version: me?.rulesRequired ?? 1 } });
      await afterLogin();
    }}
    onLogout={logout}
  />
)}

{screen.name === 'guidelines' && 
<GuidelinesScreen onBack={home} />}

        {screen.name === 'home' && (
          <View
            style={{
              flex: 1,
              flexDirection: L.wide ? 'row' : 'column',
            }}
          >
            {L.wide && (
              <SideNav
                tab={tab}
                onChange={setTab}
                badges={{ chat: unread }}
              />
            )}

            <View style={{ flex: 1 }}>
              {tab === 'home' && (
                <HomeScreen
                  onOpenRoom={openRoom}
                  onOpenProfile={openProfile}
                  onOpenWallet={() =>
                    setScreen({ name: 'wallet' })
                  }
                  onOpenNotifications={() =>
                    setScreen({ name: 'notifications' })
                  }
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

                 onOpenGuidelines={() => 
                  setScreen({ name: 'guidelines' })}
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

            {!L.wide && (
              <TabBar
                tab={tab}
                onChange={setTab}
                badges={{ chat: unread }}
              />
            )}
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
            onOpenChat={openChat}
            onOpenProfile={openProfile}
          />
        )}

        {screen.name === 'notifications' && (
          <NotificationsScreen
            onBack={home}
            onOpen={openNotification}
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
