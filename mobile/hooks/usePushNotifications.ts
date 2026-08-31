import { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Alert, Linking, Platform } from 'react-native';
import { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApiClient } from '@/utils/api';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { reportPermissionStatus } from '@/utils/permissions';

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

    // Only picks up a token if permission is already granted — never prompts on load.
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

/** Asks for permission at a meaningful moment (create/join group), not at launch. Safe to call when already granted or denied — won't re-prompt either way. */
export async function requestNotificationPermission(api: AxiosInstance): Promise<boolean> {
  if (!Device.isDevice) return false;
  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  reportPermissionStatus(api, { notifications: finalStatus as 'granted' | 'denied' | 'undetermined' });
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

const NOTIFICATION_BENEFIT_MESSAGE =
  "Get notified about:\n\n• New chat messages\n• When plans change\n• Reminders to RSVP on time";

/**
 * Shown after creating/joining a group. Unlike other one-and-done prompts,
 * nags on repeat visits even after a prior "no". Shows benefits first; "Okay"
 * then triggers the OS prompt, or deep-links to Settings if canAskAgain is false.
 */
export async function promptForNotificationPermission(api: AxiosInstance): Promise<void> {
  if (!Device.isDevice) return;

  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return;

  if (!canAskAgain) {
    Alert.alert(
      'Stay in the loop',
      `${NOTIFICATION_BENEFIT_MESSAGE}\n\nTurn notifications on in Settings.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
    return;
  }

  Alert.alert(
    'Stay in the loop',
    NOTIFICATION_BENEFIT_MESSAGE,
    [{
      text: 'Okay',
      onPress: () => {
        // Delay lets the explanation alert finish dismissing — iOS can drop a
        // native dialog fired synchronously inside another alert's onPress.
        setTimeout(() => { requestNotificationPermission(api); }, 400);
      },
    }]
  );
}

const FIRST_RSVP_IN_PROMPT_KEY = 'GT2_NOTIF_PROMPT_SHOWN_FIRST_RSVP_IN';
const FIRST_CHAT_OPEN_PROMPT_KEY = 'GT2_NOTIF_PROMPT_SHOWN_FIRST_CHAT_OPEN';

/** Runs `promptForNotificationPermission` once ever per trigger key (tracked in AsyncStorage), regardless of outcome. */
async function promptForNotificationPermissionOnce(key: string, api: AxiosInstance): Promise<void> {
  const alreadyShown = await AsyncStorage.getItem(key);
  if (alreadyShown) return;
  await AsyncStorage.setItem(key, '1');
  promptForNotificationPermission(api);
}

/** Call from the RSVP mutation's onSuccess when status === 'in'. Fires only on the user's first-ever "I'm in" RSVP. */
export function promptForNotificationPermissionOnFirstRsvpIn(api: AxiosInstance): Promise<void> {
  return promptForNotificationPermissionOnce(FIRST_RSVP_IN_PROMPT_KEY, api);
}

/** Call on mount of the group chat screen. Fires only the first time the user ever opens a chat. */
export function promptForNotificationPermissionOnFirstChatOpen(api: AxiosInstance): Promise<void> {
  return promptForNotificationPermissionOnce(FIRST_CHAT_OPEN_PROMPT_KEY, api);
}

/** Marks a "first time" trigger as consumed without showing anything, e.g. when another prompt already covered this moment. */
export function markNotificationPromptShown(trigger: 'firstRsvpIn' | 'firstChatOpen'): Promise<void> {
  const key = trigger === 'firstRsvpIn' ? FIRST_RSVP_IN_PROMPT_KEY : FIRST_CHAT_OPEN_PROMPT_KEY;
  return AsyncStorage.setItem(key, '1');
}