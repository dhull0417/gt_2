import { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useApiClient } from '@/utils/api';
import { useRouter } from 'expo-router'; // Added for navigation
import Constants from 'expo-constants';

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const usePushNotifications = () => {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>(undefined);
  const [notification, setNotification] = useState<Notifications.Notification | undefined>(undefined);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  
  const api = useApiClient();
  const router = useRouter(); // Initialize router

  useEffect(() => {
    // 1. Register for tokens and sync with backend
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        // POST to the new endpoint we added in the Canvas
        api.post('/api/users/push-token', { token }).catch(err => {
          console.error("Failed to save push token to backend", err);
        });
      }
    });

    // 2. Handle foreground notifications
    notificationListener.current = Notifications.addNotificationReceivedListener((notification: Notifications.Notification) => {
      setNotification(notification);
    });

    // 3. Handle deep linking when a user taps a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      // FIXED: Cast data to Record<string, any> to resolve TypeScript Error 2322
      const data = response.notification.request.content.data as Record<string, any>;
      
      if (data?.type === 'chat' && data?.channelId) {
        // Navigate to the specific group chat using the openChatId param
        router.push({
          pathname: '/(tabs)/groups',
          params: { openChatId: String(data.channelId) }
        });
      } else if (data?.type === 'waitlist_promotion' || data?.type === 'event_cancellation') {
        // Navigate to the home/calendar tab
        router.push('/(tabs)');
      } else if (data?.type === 'group-invite' || data?.type === 'group-added') {
        // Navigate to the notifications center
        router.push('/notifications');
      }
    });

    // 4. Cleanup listeners on unmount
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return { expoPushToken, notification };
};

async function registerForPushNotificationsAsync() {
  let token: string | undefined;

  // Android-specific channel configuration
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
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    
    // EAS Project ID is required for newer Expo SDK versions
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
      console.error("Error fetching push token", e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}