import { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Alert, Linking, Platform } from 'react-native';
import { AxiosInstance } from 'axios';
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
    const { type, meetupId, groupId } = data || {};

    if (type === 'chat' && groupId) {
      router.push({
        pathname: '/group-chat/[id]',
        params: { id: String(groupId) }
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

    // Only picks up a token if permission was already granted (e.g. from an
    // earlier group create/join prompt) — never prompts on app load.
    getPushTokenIfAuthorized().then(token => {
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

async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }
}

async function fetchExpoPushToken(): Promise<string | undefined> {
  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    console.error("Push token error:", e);
    return undefined;
  }
}

/** Picks up a token only if notification permission is already granted — never prompts. */
async function getPushTokenIfAuthorized(): Promise<string | undefined> {
  if (!Device.isDevice) return undefined;
  await ensureAndroidChannel();
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return undefined;
  return fetchExpoPushToken();
}

/**
 * Asks for notification permission at a meaningful moment (creating or joining
 * a group) rather than blind at app launch, and registers the resulting token
 * with the backend. Safe to call when permission is already granted or already
 * denied — it won't re-prompt in either case (the OS itself blocks the denied
 * case; the granted case just re-registers the token).
 */
export async function requestNotificationPermission(api: AxiosInstance): Promise<boolean> {
  if (!Device.isDevice) return false;
  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return false;

  const token = await fetchExpoPushToken();
  if (!token) return false;

  try {
    await api.post('/api/users/push-token', { token });
  } catch (err: any) {
    if (err.response?.status !== 401) console.error("Failed to save push token", err);
  }
  return true;
}

/**
 * Point-of-use notification ask, shown right after creating or joining a
 * group. Nags on repeat visits even after a prior "no" — missing group
 * notifications is costly enough to be worth re-asking, unlike the
 * one-and-done location/contacts prompts.
 *
 * A single "Okay" popup explains the benefit; tapping it fires the real OS
 * permission dialog immediately after. If the OS itself won't show that
 * dialog again (canAskAgain false — decided once on iOS, or "don't ask
 * again" on Android), this instead offers a one-tap Settings deep link.
 */
export async function promptForNotificationPermission(api: AxiosInstance): Promise<void> {
  if (!Device.isDevice) return;

  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return;

  if (!canAskAgain) {
    Alert.alert(
      'Notifications are off',
      'Turn on notifications in Settings to get updates from your groups.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
    return;
  }

  Alert.alert(
    'Stay in the loop',
    'Turn on notifications to know when your group plans something new or sends a message.',
    [{
      text: 'Okay',
      onPress: () => {
        // iOS can silently drop a native dialog fired synchronously inside another
        // alert's onPress — the explanation alert is still animating away. A short
        // delay lets it fully dismiss before the real OS permission prompt fires.
        setTimeout(() => { requestNotificationPermission(api); }, 400);
      },
    }]
  );
}