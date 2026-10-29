import { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Alert, Linking, Platform } from 'react-native';
import { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MutationObserver, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '@/utils/api';
import { useRouter, useRootNavigationState } from 'expo-router';
import Constants from 'expo-constants';
import { reportPermissionStatus } from '@/utils/permissions';
import { getActiveChat } from '@/utils/activeChat';
import { goToTarget, resolveNotificationTarget, routeInputFromPush } from '@/utils/notificationRouting';
import { RSVP_MUTATION_KEY, type RsvpVariables } from '@/utils/offlineMutations';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // A message for the chat you're already looking at is just noise.
    const data: any = notification.request.content.data;
    const isOpenChat = data?.type === 'chat' && !!data?.groupId && data.groupId === getActiveChat();
    return {
      shouldPlaySound: !isOpenChat,
      shouldSetBadge: false,
      shouldShowBanner: !isOpenChat,
      shouldShowList: !isOpenChat,
    };
  },
});

// Android can't run JS for a background action tap once the app has been killed, so the
// RSVP was silently lost there. Opening the app guarantees it goes through.
const ACTION_OPENS_APP = Platform.OS === 'android';

const defineNotificationCategories = async () => {
  await Notifications.setNotificationCategoryAsync('EVENT_RSVP', [
    {
      identifier: 'GOING',
      buttonTitle: "I'm In",
      options: { opensAppToForeground: ACTION_OPENS_APP },
    },
    {
      identifier: 'OUT',
      buttonTitle: "I'm Out",
      options: { opensAppToForeground: ACTION_OPENS_APP, isDestructive: true },
    },
  ]);
};

export const usePushNotifications = (isSignedIn: boolean = false, hasBackendUser: boolean = false) => {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>(undefined);
  const [notification, setNotification] = useState<Notifications.Notification | undefined>(undefined);
  
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  
  const api = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const pendingNavigationData = useRef<any>(null);
  // Read through a ref: the listeners below are registered once on mount, so a plain closure
  // kept seeing the navigator as "not ready" and parked every later tap in the queue.
  const navReadyRef = useRef(false);
  navReadyRef.current = !!rootNavigationState?.key;

  // Helper to handle navigation logic in one place
  const handleNotificationNavigation = (data: any) => {
    // On a cold start, this can fire before the root navigator has mounted.
    // Pushing into a stack that isn't ready yet leaves the pushed screen as the
    // only entry, so its back arrow has nothing to go back to. Queue it instead
    // and let the effect below flush it once the navigator reports ready.
    if (!navReadyRef.current) {
      pendingNavigationData.current = data;
      return;
    }

    goToTarget(router, resolveNotificationTarget(routeInputFromPush(data)));
  };

  // On Android the tap that launched the app arrives twice (the cold-start lookup and the
  // listener both see it), which pushed the same screen twice.
  const handledResponses = useRef(new Set<string>());

  const handleResponse = async (response: Notifications.NotificationResponse) => {
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handledResponses.current.has(key)) return;
    handledResponses.current.add(key);

    const data = (response.notification.request.content.data ?? {}) as Record<string, any>;
    const actionIdentifier = response.actionIdentifier;

    // I'm In / I'm Out buttons on a reminder push
    if (actionIdentifier === 'GOING' || actionIdentifier === 'OUT') {
      // Android leaves the notification up after an action button is tapped.
      Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
      const meetupId = data.meetupId;
      if (!meetupId) return;
      const status = actionIdentifier === 'GOING' ? 'in' : 'out';
      try {
        // The shared RSVP mutation: queued if offline, and refreshes the lists when it lands.
        await new MutationObserver<unknown, any, RsvpVariables>(queryClient, { mutationKey: RSVP_MUTATION_KEY })
          .mutate({ meetupId: String(meetupId), status, skipResponsePopup: true });
      } catch {
        // Couldn't RSVP from the notification (not signed in yet, full, deadline passed): open the meetup.
        handleNotificationNavigation(data);
      }
      return;
    }

    handleNotificationNavigation(data);
  };

  // Flush a navigation that arrived before the root navigator was ready.
  useEffect(() => {
    if (rootNavigationState?.key && pendingNavigationData.current) {
      const data = pendingNavigationData.current;
      pendingNavigationData.current = null;
      handleNotificationNavigation(data);
    }
  }, [rootNavigationState?.key]);

  useEffect(() => {
    defineNotificationCategories();

    // Only picks up a token if permission is already granted — never prompts on load.
    getPushTokenIfAuthorized().then(token => {
      if (token) setExpoPushToken(token);
    });

    // 1. Handle "Cold Start" (App was closed, now opening via notification)
    // (It used to skip the action check, so tapping I'm In on a killed app only opened the meetup.)
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        handleResponse(response);
        // Otherwise a later normal launch can replay the same tap.
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    }).catch(() => {});

    // 2. Listen for notifications while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(notif => {
      setNotification(notif);
      // A cancellation (e.g. minimum headcount not met) changes a meetup the
      // user may be looking at; refresh the list so it updates immediately.
      const pushData = notif.request.content.data as Record<string, any> | undefined;
      const type = pushData?.type;
      const pushType = pushData?.pushType as string | undefined;
      // Anything about a meetup (cancelled, RSVPs opened, details changed, waitlist moves, ...)
      // refreshes the list so cards update right away; the bell badge follows.
      if (type === 'meetup_cancellation' || type === 'rsvp_open' || pushType?.startsWith('meetup-') || pushType === 'waitlist-promotion' || pushType === 'priority-bumped' || pushData?.meetupId) {
        queryClient.invalidateQueries({ queryKey: ['meetups'] });
      }
      if (type !== 'chat') {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
      if (pushType?.startsWith('group-') || pushType === 'ownership-transferred' || pushType === 'invite-accepted') {
        queryClient.invalidateQueries({ queryKey: ['groups'] });
      }
      // A new message in another chat: re-sort the Groups list and update its unread dot/count now,
      // instead of only on the next visit to the tab.
      if (type === 'chat') {
        queryClient.invalidateQueries({ queryKey: ['groups'] });
        queryClient.invalidateQueries({ queryKey: ['currentUser'] });
        queryClient.invalidateQueries({ queryKey: ['unreadCounts'] });
      }
    });

    // 3. Listen for notification taps while app is in background/foreground
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(response);
    });

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  useEffect(() => {
    if (isSignedIn && hasBackendUser && expoPushToken) {
      api.post('/api/users/push-token', { token: expoPushToken })
        .then(() => rememberRegisteredToken(expoPushToken))
        .catch(err => {
          if (err.response?.status !== 401) console.error("Failed to save push token", err);
        });
    }
  }, [isSignedIn, hasBackendUser, expoPushToken]);

  return { expoPushToken, notification };
};

const PUSH_TOKEN_KEY = 'GT2_REGISTERED_PUSH_TOKEN';

/** Remembers which token this device registered, so sign-out can stop pushes for the account. */
async function rememberRegisteredToken(token: string) {
  try { await AsyncStorage.setItem(PUSH_TOKEN_KEY, token); } catch {}
}

/** Call BEFORE signing out: stops this device from getting the account's pushes. Never throws. */
export async function unregisterPushToken(api: AxiosInstance): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return;
    await api.delete('/api/users/push-token', { data: { token } });
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // Offline or already signed out; the server also drops dead tokens by itself.
  }
}

async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
    // Separate channels so people can tune them in system settings.
    await Notifications.setNotificationChannelAsync('chat', {
      name: 'Chat messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Meetup reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
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
    await rememberRegisteredToken(token);
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

/**
 * Runs `promptForNotificationPermission` the first time (ever, across app
 * installs kept in AsyncStorage) this key's trigger occurs — never again
 * after that, regardless of outcome. Android's Auto Backup restores this
 * AsyncStorage flag on reinstall without restoring the actual OS permission
 * grant, so the stored flag alone can't be trusted — only skip if the OS
 * itself already has a final answer (granted, or denied with no further
 * asking allowed); an undetermined status always gets a prompt.
 */
async function promptForNotificationPermissionOnce(key: string, api: AxiosInstance): Promise<void> {
  const alreadyShown = await AsyncStorage.getItem(key);
  if (alreadyShown) {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== 'undetermined' || !canAskAgain) return;
  } else {
    await AsyncStorage.setItem(key, '1');
  }
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