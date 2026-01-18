import { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useApiClient } from '@/utils/api';
import { useRouter } from 'expo-router';
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

/**
 * PROJECT 4: AUTH-AWARE PUSH NOTIFICATIONS
 * This hook manages device registration, deep linking, and syncing tokens with the backend.
 * @param isSignedIn - Optional boolean to ensure token sync only happens when authenticated.
 */
export const usePushNotifications = (isSignedIn: boolean = false) => {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>(undefined);
  const [notification, setNotification] = useState<Notifications.Notification | undefined>(undefined);
  
  // Explicitly type the refs as Subscription | null to satisfy TypeScript
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  
  const api = useApiClient();
  const router = useRouter();

  useEffect(() => {
    // 1. Hardware Registration: Always get the token from the device
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
      }
    });

    // 2. Foreground Listener: Handle alerts while the app is open
    notificationListener.current = Notifications.addNotificationReceivedListener((notification: Notifications.Notification) => {
      setNotification(notification);
    });

    // 3. Response Listener: Handle Deep Linking when a user taps a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
      // Cast data to Record<string, any> to allow safe property access
      const data = response.notification.request.content.data as Record<string, any>;
      
      if (data?.type === 'chat' && data?.channelId) {
        // Navigate to the groups tab and signal which chat to open
        router.push({
          pathname: '/(tabs)/groups',
          params: { openChatId: String(data.channelId) }
        });
      } else if (data?.type === 'waitlist_promotion' || data?.type === 'event_cancellation') {
        // Navigate to the main calendar/home tab
        router.push('/(tabs)');
      } else if (data?.type === 'group-invite' || data?.type === 'group-added') {
        // Navigate to the notifications screen
        router.push('/notifications');
      }
    });

    // Cleanup: Remove listeners using the .remove() method
    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  /**
   * 4. Backend Sync
   * This effect only runs when the user is signed in and we have a token.
   * This prevents the 401 Unauthorized errors on initial app load.
   */
  useEffect(() => {
    if (isSignedIn && expoPushToken) {
      api.post('/api/users/push-token', { token: expoPushToken }).catch(err => {
        // Log error only if it's not a transient auth race condition
        if (err.response?.status !== 401) {
          console.error("Failed to save push token to backend", err);
        }
      });
    }
  }, [isSignedIn, expoPushToken]);

  return { expoPushToken, notification };
};

/**
 * Core logic to request permissions and fetch the unique Expo token.
 */
async function registerForPushNotificationsAsync() {
  let token: string | undefined;

  // Android requires a specific channel for notifications to show
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
      console.log('Push notification permissions not granted');
      return;
    }
    
    // EAS Project ID is required for newer Expo environments
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    
    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
      console.error("Error fetching Expo push token", e);
    }
  } else {
    console.log('Push notifications require a physical device');
  }

  return token;
}