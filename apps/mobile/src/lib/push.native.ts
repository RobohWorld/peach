import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let registered: string | null = null;

export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('live', {
      name: 'Live alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync('chat', {
      name: 'Messages and friend requests',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;

  const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  await api('/me/push-token', { method: 'POST', body: { token, platform: Platform.OS } });
  registered = token;
  return token;
}

export async function unregisterPush(): Promise<void> {
  if (!registered) return;
  try { await api('/me/push-token/remove', { method: 'POST', body: { token: registered } }); } catch {}
  registered = null;
}

export function onNotificationTap(handler: (data: any) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    handler(r.notification.request.content.data);
  });
  return () => sub.remove();
}
