import { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useApiClient } from '@/utils/api';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * PROJECT 4: AUTH-AWARE PUSH NOTIFICATIONS
 * @param isSignedIn - Boolean from Clerk auth state.
 * @param hasBackendUser - Boolean indicating if the MongoDB user record is ready.
 */
export const usePushNotifications = (isSignedIn: boolean = false, hasBackendUser: boolean = false) => {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>(undefined);
  const [notification, setNotification] = useState<Notifications.Notification | undefined>(undefined);
  
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  
  const api = useApiClient();
  const router = useRouter();

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) setExpoPushToken(token);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener((notification: Notifications.Notification) => {
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as Record<string, any>;
      
      if (data?.type === 'chat' && data?.channelId) {
        router.push({
          pathname: '/(tabs)/groups',
          params: { openChatId: String(data.channelId) }
        });
      } else if (data?.type === 'waitlist_promotion' || data?.type === 'event_cancellation') {
        router.push('/(tabs)');
      } else if (data?.type === 'group-invite' || data?.type === 'group-added') {
        router.push('/notifications');
      }
    });

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  /**
   * FIX: Wait for Backend Sync
   * We only POST the token once hasBackendUser is true.
   * This prevents the 404 error during the sign-up race condition.
   */
  useEffect(() => {
    if (isSignedIn && hasBackendUser && expoPushToken) {
      api.post('/api/users/push-token', { token: expoPushToken }).catch(err => {
        if (err.response?.status !== 401) {
          console.error("Failed to save push token to backend", err);
        }
      });
    }
  }, [isSignedIn, hasBackendUser, expoPushToken]);

  return { expoPushToken, notification };
};

async function registerForPushNotificationsAsync() {
  let token: string | undefined;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') return;
    
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
      console.error("Error fetching Expo push token", e);
    }
  }

  return token;
}