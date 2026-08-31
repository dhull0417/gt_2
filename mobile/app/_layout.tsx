import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClerkProvider, useAuth, useUser } from '@clerk/expo';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useUserSync } from '@/hooks/useUserSync';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { User, useApiClient, userApi } from '@/utils/api';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { syncPermissionsIfChanged } from '@/utils/permissions';
import { PENDING_INVITE_KEY } from '@/app/join/[token]';
import { ImageCropperHost } from '@/components/ImageCropperHost';
import { OfflineBanner } from '@/components/OfflineBanner';
import { WelcomeModal } from '@/components/WelcomeModal';
import "../global.css";

SplashScreen.preventAutoHideAsync();

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Avoids refetching on every tab-switch/nav-back focus
      staleTime: 5 * 60 * 1000,
      // Keeps cached data around as a useful offline fallback for days, not minutes
      gcTime: ONE_WEEK_MS,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'GT2_QUERY_CACHE',
});

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
      <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
            maxAge: ONE_WEEK_MS,
            // Mutations aren't queued/replayed yet — only persist read data.
            dehydrateOptions: { shouldDehydrateMutation: () => false },
          }}
        >
          <AuthLayout />
          <ImageCropperHost />
        </PersistQueryClientProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

const AuthLayout = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const { user: clerkUser } = useUser();
  const segments = useSegments();
  const router = useRouter();
  const api = useApiClient();
  const queryClient = useQueryClient();

  const isAppleUser = clerkUser?.externalAccounts?.some(a => (a.provider as string).includes('apple')) ?? false;
  const inTabsGroup = segments[0] === '(tabs)';

  useUserSync();

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
      // No Mongo user yet always routes through profile-setup — its Save triggers syncUser
      const profileIncomplete = !currentUser || (!isAppleUser && (!currentUser.firstName?.trim() || !currentUser.lastName?.trim()));
      // TEMP DEBUG — remove once the profile-setup redirect-loop bug is diagnosed.
      console.log('[routing]', { segment: segments[0], profileIncomplete, firstName: currentUser?.firstName, lastName: currentUser?.lastName, isAppleUser });
      if (profileIncomplete && segments[0] !== 'profile-setup') {
        console.log('[routing] bouncing to /profile-setup');
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
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <WelcomeModal visible={showWelcomeModal} onClose={closeWelcomeModal} />
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
        <Stack.Screen name="add-members" options={{ headerShown: false }} />
        <Stack.Screen name="create-group" options={{ presentation: 'card', headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications'}} />
        <Stack.Screen name="join" options={{ headerShown: false }} />
        <Stack.Screen name="sso-callback" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
};
