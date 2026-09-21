import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClerkProvider, useAuth, useUser } from '@clerk/expo';
import { resourceCache } from '@clerk/expo/resource-cache';
import { Stack, useRouter, useSegments } from 'expo-router';
import { MutationCache, QueryClient, onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useUserSync } from '@/hooks/useUserSync';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { User, useApiClient, userApi, meetupApi, groupApi, notificationApi } from '@/utils/api';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { syncPermissionsIfChanged } from '@/utils/permissions';
import { PENDING_INVITE_KEY } from '@/app/join/[token]';
import { ImageCropperHost } from '@/components/ImageCropperHost';
import { OfflineBanner } from '@/components/OfflineBanner';
import { OfflineBannerHeightProvider } from '@/contexts/OfflineBannerContext';
import { WelcomeModal } from '@/components/WelcomeModal';
import { UpdateNameModal } from '@/components/UpdateNameModal';
import { setClerkTokenGetter, getClerkToken } from '@/utils/authToken';
import { registerChatMutationDefaults, SEND_MESSAGE_MUTATION_KEY, type SendMessageVariables } from '@/utils/chatMutations';
import { registerOfflineMutationDefaults, RSVP_MUTATION_KEY, ACCEPT_INVITE_MUTATION_KEY, DECLINE_INVITE_MUTATION_KEY } from '@/utils/offlineMutations';
import { broadcastMeetupUpdate } from '@/utils/groupRealtime';
import type { Meetup } from '@/utils/api';
import "../global.css";

SplashScreen.preventAutoHideAsync();

// expo-notifications logs these on every load when running in Expo Go (remote
// push genuinely isn't supported there — a dev build doesn't have this
// limitation). They're expected noise, not an error to act on, so filter them
// out of the terminal instead of seeing them on every reload.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const first = args[0];
  if (typeof first === 'string' && first.includes('expo-notifications')) return;
  originalWarn(...args);
};

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Mutations queued/replayed offline (persisted to disk and resumed on reconnect
// or app restart) — everything else still just fails fast with an alert offline.
const QUEUED_MUTATION_KEYS: readonly string[] = [
  'sendMessage',
  RSVP_MUTATION_KEY[0],
  ACCEPT_INVITE_MUTATION_KEY[0],
  DECLINE_INVITE_MUTATION_KEY[0],
];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Avoids refetching on every tab-switch/nav-back focus
      staleTime: 5 * 60 * 1000,
      // Keeps cached data around as a useful offline fallback for days, not minutes
      gcTime: ONE_WEEK_MS,
    },
  },
  mutationCache: new MutationCache({
    // Runs for every mutation of these kinds regardless of whether a screen is
    // still mounted to see it — unlike a callback passed to useMutation(), this
    // still fires for one resumed in the background after the user has
    // navigated away, or after an app restart.
    onSuccess: (_data, variables, _context, mutation) => {
      switch (mutation.options.mutationKey?.[0]) {
        case SEND_MESSAGE_MUTATION_KEY[0]: {
          // Needed for a send that finishes after being paused offline: the
          // realtime INSERT event only reaches a chat screen that's mounted
          // and subscribed at the moment it lands, so without this the
          // message can go missing from the thread even though it made it
          // to Supabase (it still shows up via the group list's own refetch
          // of last-message, which is what made this look like a display-only
          // bug rather than the message failing to send). Skipped for a normal
          // online send (resolves in well under a second) since realtime's own
          // INSERT event already delivers those - no need for the extra fetch.
          const elapsed = Date.now() - mutation.state.submittedAt;
          if (elapsed > 3000) {
            const { groupId } = variables as SendMessageVariables;
            queryClient.invalidateQueries({ queryKey: ['messages', groupId] });
          }
          break;
        }
        case RSVP_MUTATION_KEY[0]: {
          queryClient.invalidateQueries({ queryKey: ['meetups'] });
          // Ping other devices viewing this meetup so they pick up the RSVP
          // right away instead of waiting on staleTime (mirrors the group
          // realtime pattern in utils/groupRealtime.ts). Runs here rather
          // than in useRsvp's onSuccess so it still fires for an RSVP that
          // resumes after a reconnect/app restart with no screen mounted.
          const meetup = (_data as { meetup?: Meetup } | undefined)?.meetup;
          const groupId = meetup ? (typeof meetup.group === 'string' ? meetup.group : meetup.group._id) : undefined;
          if (groupId) broadcastMeetupUpdate(getClerkToken, groupId);
          break;
        }
        case ACCEPT_INVITE_MUTATION_KEY[0]:
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['groups'] });
          break;
        case DECLINE_INVITE_MUTATION_KEY[0]:
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          break;
      }
    },
  }),
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'GT2_QUERY_CACHE',
});

// Lets a chat send, RSVP, or invite response survive being offline: the
// mutationFn is looked up by key here (see utils/chatMutations.ts and
// utils/offlineMutations.ts) rather than closed over in a component, so one
// queued before an app kill can still be resumed on the next launch.
registerChatMutationDefaults(queryClient);
registerOfflineMutationDefaults(queryClient);

// Drives React Query's online state off real connectivity so queries pause offline instead of failing
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected && state.isInternetReachable !== false);
  });
});

const tokenCache = {
  async getToken(key: string) {
    try { return await SecureStore.getItemAsync(key); } catch { return null; }
  },
  async saveToken(key: string, value: string) {
    try { await SecureStore.setItemAsync(key, value); } catch {}
  },
};

export default function RootLayout() {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error('Missing Clerk Publishable Key');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ClerkProvider
        tokenCache={tokenCache}
        publishableKey={publishableKey}
        // Persists Clerk's client/session resources to SecureStore so a signed-in user
        // can reach `isLoaded` (and the app) on a cold start with no network — otherwise
        // Clerk has to fetch that state from its API before auth can resolve at all.
        __experimental_resourceCache={resourceCache}
      >
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
            maxAge: ONE_WEEK_MS,
            dehydrateOptions: {
              shouldDehydrateMutation: (mutation) =>
                QUEUED_MUTATION_KEYS.includes(mutation.options.mutationKey?.[0] as string),
            },
          }}
          // Resumes any send that was still paused-offline when the app was last
          // closed, once the persisted cache (and this mutation) is back in memory.
          onSuccess={() => { queryClient.resumePausedMutations(); }}
        >
          <AuthLayout />
          <ImageCropperHost />
        </PersistQueryClientProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

const AuthLayout = () => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const segments = useSegments();
  const router = useRouter();
  const api = useApiClient();
  const queryClient = useQueryClient();

  const isAppleUser = clerkUser?.externalAccounts?.some(a => (a.provider as string).includes('apple')) ?? false;
  const inTabsGroup = segments[0] === '(tabs)';

  useUserSync();

  // Gives the mutation-defaults registry (utils/authToken.ts) a way to fetch a
  // token outside React, for queued mutations resumed with no screen mounted.
  useEffect(() => {
    setClerkTokenGetter(isSignedIn ? getToken : null);
    return () => setClerkTokenGetter(null);
  }, [isSignedIn, getToken]);

  // Mutations created in this session auto-resume on reconnect, but a send
  // restored from disk needs an explicit kick once connectivity is confirmed.
  useEffect(() => {
    return onlineManager.subscribe((isOnline) => {
      if (isOnline) queryClient.resumePausedMutations();
    });
  }, [queryClient]);

  useEffect(() => {
    if (!isSignedIn) setNameModalDismissed(false);
  }, [isSignedIn]);

  // Deferred deep link for fresh installs: check clipboard for an invite token from the web landing page
  useEffect(() => {
    Clipboard.getStringAsync().then(clip => {
      if (clip?.startsWith('groupthat://join/')) {
        const token = clip.replace('groupthat://join/', '').trim();
        if (token) SecureStore.setItemAsync(PENDING_INVITE_KEY, token);
      }
    }).catch(() => {});
  }, []);

  const { data: currentUser, isSuccess, isError: isCurrentUserError } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
    enabled: isSignedIn,
  });

  // isCurrentUserError = Clerk session but no Mongo user yet (new sign-up); treat as settled so routing can redirect to profile-setup
  const currentUserSettled = isSuccess || isCurrentUserError;

  // Warms the Home/Groups tab caches before the user ever taps those tabs, so the
  // first switch shows real content immediately instead of a loading flash + reflow
  // (both tabs are lazy-mounted and previously only fetched on their own first focus).
  useEffect(() => {
    if (!isSignedIn || !isSuccess) return;
    queryClient.prefetchQuery({ queryKey: ['meetups'], queryFn: () => meetupApi.getMeetups(api) });
    queryClient.prefetchQuery({ queryKey: ['groups'], queryFn: () => groupApi.getGroups(api) });
    queryClient.prefetchQuery({ queryKey: ['notifications'], queryFn: () => notificationApi.getNotifications(api) });
  }, [isSignedIn, isSuccess]);

  usePushNotifications(isSignedIn, isSuccess);

  // Silent permission sync — picks up grants/denials changed outside the app (e.g. OS Settings)
  useEffect(() => {
    if (isSignedIn && isSuccess) {
      syncPermissionsIfChanged(api);
    }
  }, [isSignedIn, isSuccess]);

  // Driven by currentUser.hasSeenWelcome, not local state — AuthLayout stays mounted across
  // sign-out/sign-in, so a useState flag would leak into the next user's session. Closing
  // writes to the query cache instead, which sign-out already clears.
  const showWelcomeModal = !!currentUser && !currentUser.hasSeenWelcome && inTabsGroup;

  // Apple only grants a name on the account's very first authorization ever, so a
  // returning/re-created Apple account can reach the tabs with nothing on file (the
  // profileIncomplete check below deliberately skips the name for Apple users so they
  // aren't blocked from the app). Driven by currentUser rather than a dismiss flag, so
  // it resurfaces on every app open — not persisted locally — until the name is set.
  const [nameModalDismissed, setNameModalDismissed] = useState(false);
  const needsNameUpdate = !!currentUser && isAppleUser
    && !currentUser.firstName?.trim() && !currentUser.lastName?.trim();
  const showUpdateNameModal = needsNameUpdate && inTabsGroup && !showWelcomeModal && !nameModalDismissed;

  const markWelcomeSeen = useMutation({
    mutationFn: () => userApi.updateProfile(api, { hasSeenWelcome: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
  });

  const closeWelcomeModal = () => {
    queryClient.setQueryData<User>(['currentUser'], (old) => old ? { ...old, hasSeenWelcome: true } : old);
    markWelcomeSeen.mutate();
  };

  // === ROUTING LOGIC ===
  useEffect(() => {
    if (!isLoaded || (isSignedIn && !currentUserSettled)) return;

    const inAuthGroup = segments[0] === '(auth)';
    // Mid-OAuth: Clerk hasn't flipped isSignedIn yet on mount (see sso-callback.tsx) — wait for it to settle
    const inSsoCallback = segments[0] === 'sso-callback';

    // Routes exempt from the dashboard redirect during configuration flows
    const inAllowedModalGroup = [
      'profile-setup',
      'account',
      'group-edit-schedule',
      'group-edit-jit',
      'group-settings',
      'group-chat',
      'group-details',
      'meetup-edit',
      'schedule-meetup',
      'add-members',
      'create-group',
      'group',
      'notifications',
      'join',
    ].includes(segments[0]);

    if (isSignedIn) {
      // No Mongo user yet always routes through profile-setup — its Save triggers syncUser.
      // Also gates on zipCode: Apple users can already have a Mongo user with a name at this
      // point (useAppleAuth syncs it as soon as Apple grants one, before profile-setup ever
      // runs), which would otherwise let them skip straight past the zip code step.
      const profileIncomplete = !currentUser
        || (!isAppleUser && (!currentUser.firstName?.trim() || !currentUser.lastName?.trim()))
        || !currentUser.zipCode?.trim();
      if (profileIncomplete && segments[0] !== 'profile-setup') {
        router.replace('/profile-setup');
      } else if (!profileIncomplete && !inTabsGroup && !inAllowedModalGroup) {
        router.replace('/(tabs)');
      }
    } else if (!isSignedIn && !inAuthGroup && !inSsoCallback) {
      router.replace('/(auth)');
    }
  }, [isLoaded, isSignedIn, currentUser, currentUserSettled, segments, router, clerkUser]);

  useEffect(() => {
    if (isLoaded && ((isSignedIn && currentUserSettled) || !isSignedIn)) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded, isSignedIn, isSuccess]);

  // Redeem a saved invite token after sign-in for users who tapped a link while signed out
  useEffect(() => {
    if (!isSignedIn || !currentUser) return;
    const profileIncomplete = !currentUser.firstName?.trim() || !currentUser.lastName?.trim();
    if (profileIncomplete) return; // useUpdateProfile handles this case after setup

    SecureStore.getItemAsync(PENDING_INVITE_KEY).then(pendingToken => {
      if (pendingToken) {
        SecureStore.deleteItemAsync(PENDING_INVITE_KEY);
        router.push({ pathname: '/join/[token]', params: { token: pendingToken } });
      }
    }).catch(() => {});
  }, [isSignedIn, currentUser?._id]);

  return (
    <OfflineBannerHeightProvider>
      <View style={{ flex: 1 }}>
        <OfflineBanner />
        <WelcomeModal visible={showWelcomeModal} onClose={closeWelcomeModal} />
        <UpdateNameModal visible={showUpdateNameModal} onClose={() => setNameModalDismissed(true)} />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="profile-setup" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="account" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="group-edit-schedule" options={{ headerShown: false }} />
          <Stack.Screen name="group-edit-jit" options={{ headerShown: false }} />
          <Stack.Screen name="group-settings" options={{ headerShown: false }} />
          <Stack.Screen name="group-chat" options={{ headerShown: false }} />
          <Stack.Screen name="group-details" options={{ headerShown: false }} />
          <Stack.Screen name="meetup-edit" options={{ headerShown: false }} />
          <Stack.Screen name="schedule-meetup" options={{ headerShown: false }} />
          <Stack.Screen name="add-members" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="create-group" options={{ presentation: 'card', headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications'}} />
          <Stack.Screen name="join" options={{ headerShown: false }} />
          <Stack.Screen name="sso-callback" options={{ headerShown: false }} />
        </Stack>
      </View>
    </OfflineBannerHeightProvider>
  );
};
