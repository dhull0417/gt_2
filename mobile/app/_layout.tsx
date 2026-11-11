import { AppState, View, Text, ActivityIndicator } from 'react-native';
import { WindowInsetsProvider } from '@/contexts/WindowInsetsContext';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClerkProvider, useAuth, useUser } from '@clerk/expo';
import { resourceCache } from '@clerk/expo/resource-cache';
import { Stack, useRouter, useSegments } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { MutationCache, QueryClient, onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useUserSync } from '@/hooks/useUserSync';
import { usePurchasesSetup } from '@/hooks/usePurchases';
import * as SecureStore from 'expo-secure-store';
import { User, useApiClient, userApi, meetupApi, groupApi, notificationApi } from '@/utils/api';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAppBadge } from '@/hooks/useAppBadge';
import { syncPermissionsIfChanged } from '@/utils/permissions';
import { PENDING_INVITE_KEY } from '@/app/join/[token]';
import { ImageCropperHost } from '@/components/ImageCropperHost';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from '@/hooks/useIsOnline';
import { WelcomeModal } from '@/components/WelcomeModal';
import { UpdateNameModal } from '@/components/UpdateNameModal';
import { setClerkTokenGetter, getClerkToken } from '@/utils/authToken';
import { registerChatMutationDefaults, SEND_MESSAGE_MUTATION_KEY, type SendMessageVariables } from '@/utils/chatMutations';
import { upsertMessage } from '@/utils/chatCache';
import type { ChatMessage } from '@/types/chat';
import { registerOfflineMutationDefaults, RSVP_MUTATION_KEY, ACCEPT_INVITE_MUTATION_KEY, DECLINE_INVITE_MUTATION_KEY, VOTE_POLL_MUTATION_KEY, type VotePollVariables } from '@/utils/offlineMutations';
import { isQueuedKey, queuedErrorMessage, queuedErrorRefreshKey } from '@/utils/queuedMutations';
import { currentUserGate } from '@/utils/offlineState';
import { shouldPersistQuery, trimForPersist } from '@/utils/persistence';
import { isGroupThatReachable } from '@/utils/networkError';
import { useResumeQueuedMutations } from '@/hooks/useResumeQueuedMutations';
import { toast } from '@/contexts/ToastContext';
import { QUERY_CLIENT_DEFAULT_OPTIONS, ONE_DAY_MS } from '@/utils/queryClientOptions';
import { broadcastMeetupUpdate, broadcastPollUpdate } from '@/utils/groupRealtime';
import type { Meetup } from '@/utils/api';
import { ToastProvider } from '@/contexts/ToastContext';
import { AppearanceProvider, useAppearance, useThemeColors } from '@/contexts/AppearanceContext';
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


const queryClient = new QueryClient({
  defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
  mutationCache: new MutationCache({
    // A queued action (sent after reconnecting, maybe with no screen open) that the server refused
    // or that ran out of retries: say so once, and put the screen back to what the server has.
    onError: (error, _variables, _context, mutation) => {
      const key = mutation.options.mutationKey?.[0];
      if (!isQueuedKey(key)) return;
      const message = queuedErrorMessage(key, error);
      if (message) toast.error(message);
      const refreshKey = queuedErrorRefreshKey(key, _variables as object | string | undefined);
      if (refreshKey) queryClient.invalidateQueries({ queryKey: refreshKey });
      // Only a message keeps its failed state (its bubble offers Retry / Discard).
      if (key !== 'sendMessage') queryClient.getMutationCache().remove(mutation);
    },
    // Runs for every mutation of these kinds regardless of whether a screen is
    // still mounted to see it — unlike a callback passed to useMutation(), this
    // still fires for one resumed in the background after the user has
    // navigated away, or after an app restart.
    onSuccess: (_data, variables, _context, mutation) => {
      switch (mutation.options.mutationKey?.[0]) {
        case SEND_MESSAGE_MUTATION_KEY[0]: {
          // The send returns the saved row. Put it in the thread's cache right away, before the
          // "sending" placeholder goes away, so the bubble never vanishes while we wait on the
          // realtime INSERT event - and so a send that finishes in the background (resumed after
          // an offline stretch or an app restart, with no chat screen mounted) still lands.
          const row = _data as ChatMessage | undefined;
          const { groupId } = variables as SendMessageVariables;
          const messagesKey = ['messages', groupId];
          if (row?.id && queryClient.getQueryData(messagesKey)) {
            queryClient.setQueryData<ChatMessage[]>(messagesKey, (prev) =>
              prev ? upsertMessage(prev, row) : prev
            );
          } else {
            queryClient.invalidateQueries({ queryKey: messagesKey });
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
        case VOTE_POLL_MUTATION_KEY[0]: {
          const { groupId } = variables as VotePollVariables;
          queryClient.invalidateQueries({ queryKey: ['polls', groupId] });
          broadcastPollUpdate(getClerkToken, groupId);
          break;
        }
      }
    },
  }),
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'GT2_QUERY_CACHE',
  // Chat threads are saved as their newest page only (see utils/persistence.ts).
  serialize: (client) => JSON.stringify({
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((q) => ({
        ...q,
        state: { ...q.state, data: trimForPersist(q.queryKey, q.state.data) },
      })),
    },
  }),
});

// Lets a chat send, RSVP, or invite response survive being offline: the
// mutationFn is looked up by key here (see utils/chatMutations.ts and
// utils/offlineMutations.ts) rather than closed over in a component, so one
// queued before an app kill can still be resumed on the next launch.
registerChatMutationDefaults(queryClient);
registerOfflineMutationDefaults(queryClient);

// "Online" means "can reach GroupThat", not "can reach Google": NetInfo's default check fetches a
// Google URL, which some networks block (so the app sat "offline" while our server was reachable).
// Must run before the listener below is added.
if (process.env.EXPO_PUBLIC_API_URL) {
  NetInfo.configure({
    reachabilityUrl: `${process.env.EXPO_PUBLIC_API_URL}/api/health`,
    // GET, not NetInfo's default HEAD: the older-backend fallback below needs the response body.
    reachabilityMethod: 'GET',
    reachabilityTest: async (response) =>
      isGroupThatReachable(response.status, response.status === 404 ? await response.text().catch(() => '') : ''),
    reachabilityShortTimeout: 5 * 1000,
    reachabilityLongTimeout: 60 * 1000,
    reachabilityRequestTimeout: 10 * 1000,
  });
}

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
    <AppearanceProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ToastProvider>
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
              // How long saved data is trusted after the app was last used. Past it the whole saved
              // cache is dropped, so keep it generous: a month away still opens to your groups.
              maxAge: 30 * ONE_DAY_MS,
              dehydrateOptions: {
                // Only what screens need to open offline (utils/persistence.ts).
                shouldDehydrateQuery: shouldPersistQuery,
                // Persist the ones that haven't finished: paused offline, mid-flight when the app was
                // killed, or failed and waiting on Retry/Discard. Completed ones have nothing to resume.
                shouldDehydrateMutation: (mutation) => {
                  const key = mutation.options.mutationKey?.[0];
                  if (!isQueuedKey(key) || mutation.state.status === 'success') return false;
                  // Failed ones only matter for messages (their bubble offers Retry / Discard).
                  return mutation.state.status !== 'error' || key === 'sendMessage';
                },
              },
            }}
          >
            <AuthLayout />
            <ImageCropperHost />
          </PersistQueryClientProvider>
        </ClerkProvider>
        </ToastProvider>
      </GestureHandlerRootView>
    </AppearanceProvider>
  );
}

const AuthLayout = () => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const segments = useSegments();
  const router = useRouter();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { scheme } = useAppearance();
  const colors = useThemeColors();
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();

  const isAppleUser = clerkUser?.externalAccounts?.some(a => (a.provider as string).includes('apple')) ?? false;
  const inTabsGroup = segments[0] === '(tabs)';

  useUserSync();
  usePurchasesSetup();

  // Gives the mutation-defaults registry (utils/authToken.ts) a way to fetch a
  // token outside React, for queued mutations resumed with no screen mounted.
  useEffect(() => {
    setClerkTokenGetter(isSignedIn ? getToken : null);
    return () => setClerkTokenGetter(null);
  }, [isSignedIn, getToken]);

  // Queued offline work goes out only once sign-in is ready (see the hook for why).
  useResumeQueuedMutations(!!isLoaded && !!isSignedIn);

  // Coming back to the app after a while: Android suspends the realtime socket in the background,
  // so updates broadcast meanwhile were missed and the lists stayed stale until a tab switch.
  // Refresh the main lists (delta-synced, so this is cheap) once the app is in front again.
  useEffect(() => {
    if (!isSignedIn) return;
    let backgroundedAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        if (backgroundedAt === null) backgroundedAt = Date.now();
        return;
      }
      const awayMs = backgroundedAt === null ? 0 : Date.now() - backgroundedAt;
      backgroundedAt = null;
      if (awayMs < 15_000) return;
      for (const key of ['meetups', 'groups', 'notifications', 'currentUser', 'unreadCounts']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    });
    return () => sub.remove();
  }, [isSignedIn, queryClient]);

  useEffect(() => {
    if (!isSignedIn) setNameModalDismissed(false);
  }, [isSignedIn]);

  const { data: currentUser, isSuccess, isError: isCurrentUserError, error: currentUserError, refetch: refetchCurrentUser, isRefetching: isRefetchingCurrentUser, fetchStatus: currentUserFetchStatus } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
    enabled: isSignedIn,
  });

  // Only a 404 means "Clerk session but no Mongo user yet (new sign-up)". Anything else
  // (no network, server error) must NOT be mistaken for a brand-new user and sent to profile setup.
  const userGate = currentUserGate({
    isSignedIn,
    hasUser: !!currentUser,
    isError: isCurrentUserError,
    errorStatus: (currentUserError as any)?.response?.status,
    fetchStatus: currentUserFetchStatus,
  });
  const noBackendUser = userGate === 'new-user';
  // Signed-in only (the gate is 'signed-out' otherwise): after sign-out a still-mounted screen's
  // ['currentUser'] query can fail with no token (401), which used to cover the sign-in screen.
  // 'offline' = waiting for a connection with nothing saved (fresh install, or a long time away).
  const currentUserLoadFailed = userGate === 'failed' || userGate === 'offline';
  const retryCurrentUser = () => {
    if (!onlineManager.isOnline()) { toast.info("You're still offline."); return; }
    refetchCurrentUser();
  };

  // Drop the signed-out user's record (and any error from fetching it without a token).
  useEffect(() => {
    if (isLoaded && !isSignedIn) queryClient.removeQueries({ queryKey: ['currentUser'] });
  }, [isLoaded, isSignedIn, queryClient]);
  const currentUserSettled = isSuccess || noBackendUser;

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
  useAppBadge(!!isSignedIn, isSuccess);

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
    if (!isLoaded || (isSignedIn && !currentUserSettled) || currentUserLoadFailed) return;

    const inAuthGroup = segments[0] === '(auth)';
    // Mid-OAuth: Clerk hasn't flipped isSignedIn yet on mount (see sso-callback.tsx) — wait for it to settle
    const inSsoCallback = segments[0] === 'sso-callback';

    // Routes exempt from the dashboard redirect during configuration flows
    const inAllowedModalGroup = [
      'profile-setup',
      'account',
      'group-edit-schedule',
      'group-priority',
      'group-rankings',
      'tournament',
      'tournament-setup',
      'group-questions',
      'group-stats',
      'group-rsvp-responses',
      'group-edit-jit',
      'group-settings',
      'paywall',
      'group-chat',
      'group-details',
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
  }, [isLoaded, isSignedIn, currentUser, currentUserSettled, currentUserLoadFailed, segments, router, clerkUser]);

  useEffect(() => {
    if (isLoaded && ((isSignedIn && (currentUserSettled || currentUserLoadFailed)) || !isSignedIn)) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded, isSignedIn, isSuccess, currentUserLoadFailed, noBackendUser]);

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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {!isOnline && <OfflineBanner segment={segments[0]} />}
      {/* While the banner shows it already covers the status-bar area, so everything below gets a
          top inset of 0 (screens that pad by the inset don't double up). Native SafeAreaViews adjust
          by themselves, since they measure their own position. */}
      <WindowInsetsProvider value={insets}>
      <SafeAreaInsetsContext.Provider value={isOnline ? insets : { ...insets, top: 0 }}>
      <View style={{ flex: 1 }}>
        {currentUserLoadFailed && (
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' }}>
              {userGate === 'offline' ? "You're offline" : "Can't reach GroupThat"}
            </Text>
            <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              {userGate === 'offline'
                ? 'Connect to the internet to load your groups. Your groups and meetups are safe.'
                : 'Check your connection and try again. Your groups and meetups are safe.'}
            </Text>
            <PressableOpacity
              onPress={retryCurrentUser}
              disabled={isRefetchingCurrentUser}
              style={{ backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, minWidth: 140, alignItems: 'center' }}
            >
              {isRefetchingCurrentUser ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Try again</Text>}
            </PressableOpacity>
          </View>
        )}
        <WelcomeModal visible={showWelcomeModal} onClose={closeWelcomeModal} />
        <UpdateNameModal visible={showUpdateNameModal} onClose={() => setNameModalDismissed(true)} />
        {/* Navigation theme follows the app theme, so every nested stack's screen background is dark in
            dark mode. Without it a stack with no contentStyle (e.g. create-group) showed a white card
            behind screens as they animated in. */}
        <ThemeProvider value={{
          ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
          colors: {
            ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
            primary: colors.brand,
            background: colors.background,
            card: colors.surface,
            text: colors.textPrimary,
            border: colors.border,
            notification: colors.danger,
          },
        }}>
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="profile-setup" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="account" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="paywall" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="group-edit-schedule" options={{ headerShown: false }} />
          <Stack.Screen name="group-priority" options={{ headerShown: false }} />
          <Stack.Screen name="group-rankings" options={{ headerShown: false }} />
          <Stack.Screen name="tournament" options={{ headerShown: false }} />
          <Stack.Screen name="tournament-setup" options={{ headerShown: false }} />
          <Stack.Screen name="group-questions" options={{ headerShown: false }} />
          <Stack.Screen name="group-stats" options={{ headerShown: false }} />
          <Stack.Screen name="group-rsvp-responses" options={{ headerShown: false }} />
          <Stack.Screen name="group-edit-jit" options={{ headerShown: false }} />
          <Stack.Screen name="group-settings" options={{ headerShown: false }} />
          <Stack.Screen name="group-chat" options={{ headerShown: false }} />
          <Stack.Screen name="group-details" options={{ headerShown: false }} />
          <Stack.Screen name="add-members" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="create-group" options={{ presentation: 'card', headerShown: false }} />
          <Stack.Screen
            name="notifications"
            options={{
              headerShown: true,
              title: 'Notifications',
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.textPrimary,
              headerTitleStyle: { color: colors.textPrimary },
              headerShadowVisible: scheme === 'dark',
            }}
          />
          <Stack.Screen name="join" options={{ headerShown: false }} />
          <Stack.Screen name="sso-callback" options={{ headerShown: false }} />
        </Stack>
        </ThemeProvider>
      </View>
      </SafeAreaInsetsContext.Provider>
      </WindowInsetsProvider>
    </View>
  );
};
