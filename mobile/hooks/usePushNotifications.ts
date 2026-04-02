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

const defineNotificationCategories = async () => {
  await Notifications.setNotificationCategoryAsync('EVENT_RSVP', [
    {
      identifier: 'GOING',
      buttonTitle: "I'm In",
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'OUT',
      buttonTitle: "I'm Out",
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);
};

export const usePushNotifications = (isSignedIn: boolean = false, hasBackendUser: boolean = false) => {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>(undefined);
  const [notification, setNotification] = useState<Notifications.Notification | undefined>(undefined);
  
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  
  const api = useApiClient();
  const router = useRouter();

  // Helper to handle navigation logic in one place
  const handleNotificationNavigation = (data: any) => {
    const { type, meetupId, groupId, channelId } = data || {};
    
    // We use 'groupId' or 'channelId' (Stream uses channelId, but your screen uses openChatId)
    const targetChatId = groupId || channelId;

    if (type === 'chat' && targetChatId) {
      router.push({
        pathname: '/(tabs)/groups',
        params: { openChatId: String(targetChatId) }
      });
    } else if (meetupId) {
      router.push({
        pathname: '/(tabs)',
        params: { openMeetupId: String(meetupId) }
      });
    }
  };

  useEffect(() => {
    defineNotificationCategories();

    registerForPushNotificationsAsync().then(token => {
      if (token) setExpoPushToken(token);
    });

    // 1. Handle "Cold Start" (App was closed, now opening via notification)
    Notifications.getLastNotificationResponseAsync().then(response => {
        if (response) {
            handleNotificationNavigation(response.notification.request.content.data);
        }
    });

    // 2. Listen for notifications while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(notif => {
      setNotification(notif);
    });

    // 3. Listen for notification taps while app is in background/foreground
    responseListener.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      const actionIdentifier = response.actionIdentifier;

      // RSVP Button Background Logic
      if (actionIdentifier === 'GOING' || actionIdentifier === 'OUT') {
        const status = actionIdentifier === 'GOING' ? 'in' : 'out';
        const meetupId = data.meetupId;
        if (meetupId) {
          try {
            await api.post(`/api/meetups/${meetupId}/rsvp`, { status });
          } catch (err: any) {
            if (err.response?.status !== 401) console.error("Background RSVP failed:", err);
          }
        }
        return;
      }

      // Standard Tap Navigation
      handleNotificationNavigation(data);
    });

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  useEffect(() => {
    if (isSignedIn && hasBackendUser && expoPushToken) {
      api.post('/api/users/push-token', { token: expoPushToken }).catch(err => {
        if (err.response?.status !== 401) console.error("Failed to save push token", err);
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
      console.error("Push token error:", e);
    }
  }
  return token;
}