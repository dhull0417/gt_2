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
    shouldShowBanner: true, // Added to satisfy TypeScript requirement
    shouldShowList: true,   // Added to satisfy TypeScript requirement
  }),
});

/**
 * PROJECT 6: Actionable Notifications
 * This registers the 'EVENT_RSVP' category with the OS.
 * When the backend sends a notification with this category ID,
 * the lock screen will display "I'm In" and "I'm Out" buttons
 * once the user expands the notification (swipe down/long press).
 */
const defineNotificationCategories = async () => {
  await Notifications.setNotificationCategoryAsync('EVENT_RSVP', [
    {
      identifier: 'GOING',
      buttonTitle: "I'm In", // Updated label as requested
      options: { opensAppToForeground: false }, // Executes in background
    },
    {
      identifier: 'OUT',
      buttonTitle: "I'm Out", // Updated label
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

  useEffect(() => {
    // Register categories so the OS knows what 'EVENT_RSVP' means
    defineNotificationCategories();

    registerForPushNotificationsAsync().then(token => {
      if (token) setExpoPushToken(token);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notif => {
      setNotification(notif);
    });

    /**
     * Response Listener: Handles button clicks and notification taps.
     */
    responseListener.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      const actionIdentifier = response.actionIdentifier;

      // Logic for the RSVP Buttons (handled while app is backgrounded)
      if (actionIdentifier === 'GOING' || actionIdentifier === 'OUT') {
        const status = actionIdentifier === 'GOING' ? 'in' : 'out';
        const eventId = data.eventId;

        if (eventId) {
          try {
            // Perform the RSVP silently via API
            await api.post(`/api/events/${eventId}/rsvp`, { status });
          } catch (err) {
            console.error("Background RSVP failed:", err);
          }
        }
        return;
      }

      // Logic for standard notification taps
      if (data?.type === 'event_created' && data?.eventId) {
        router.push({
          pathname: '/(tabs)',
          params: { openEventId: String(data.eventId) }
        });
      } else if (data?.type === 'chat' && data?.channelId) {
        router.push({
          pathname: '/(tabs)/groups',
          params: { openChatId: String(data.channelId) }
        });
      }
    });

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  // Update token on backend only once we are signed in and synced
  useEffect(() => {
    if (isSignedIn && hasBackendUser && expoPushToken) {
      api.post('/api/users/push-token', { token: expoPushToken }).catch(err => {
        if (err.response?.status !== 401) {
          console.error("Failed to save push token", err);
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
      console.error("Push token error:", e);
    }
  }

  return token;
}