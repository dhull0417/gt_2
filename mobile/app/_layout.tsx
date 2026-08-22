// mobile/app/_layout.tsx
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
      // Screens re-focus often (tab switches, nav back); without this every
      // focus would refetch even when nothing could plausibly have changed.
      staleTime: 5 * 60 * 1000,
      // Keeps cached data around (and eligible for disk persistence) long
      // enough to still be useful as an offline fallback after a few days
      // away from the app, not just a few minutes.
      gcTime: ONE_WEEK_MS,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'GT2_QUERY_CACHE',
});

// Drives React Query's online/offline state off real connectivity instead of
// its default "assume online" behavior, so queries pause cleanly offline
// (serving cached data) rather than firing and failing.
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

  useUserSync();

  // On launch: check clipboard for an invite token placed there by the web landing page.
  // This is the deferred deep link mechanism for fresh installs.
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

  // isCurrentUserError means Clerk session exists but no MongoDB user yet (new sign-up).
  // Treat it the same as success so routing can redirect them to profile-setup.
  const currentUserSettled = isSuccess || isCurrentUserError;

  usePushNotifications(isSignedIn, isSuccess);

  // Shows once profile-setup is done, driven entirely by the persisted
  // hasSeenWelcome flag on the user record — not by any client-side timing
  // or "just signed up" detection, so it works the same for every sign-in
  // method and survives app reloads mid-flow.
  const profileComplete = !!currentUser && (isAppleUser || (!!currentUser.firstName?.trim() && !!currentUser.lastName?.trim()));
  const showWelcomeModal = profileComplete && !currentUser?.hasSeenWelcome;

  const markWelcomeSeen = useMutation({
    mutationFn: () => userApi.updateProfile(api, { hasSeenWelcome: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
  });

  // === ROUTING LOGIC ===
  useEffect(() => {
    if (!isLoaded || (isSignedIn && !currentUserSettled)) return;

    const inTabsGroup = segments[0] === '(tabs)';
    const inAuthGroup = segments[0] === '(auth)';

    // Allowed routes list to ensure the user isn't redirected to the dashboard during configuration flows
    const inAllowedModalGroup = [
      'profile-setup',
      'account',
      'group-edit-schedule',
      'group-edit-jit',
      'group-settings',
      'group-chat',
      'meetup-edit',
      'schedule-meetup',
      'add-members',
      'create-group',
      'group',
      'notifications',
      'join',
    ].includes(segments[0]);

    if (isSignedIn) {
      // !currentUser (no Mongo user yet) always routes through profile-setup first,
      // since its Save button is what triggers syncUser and creates the record.
      const profileIncomplete = !currentUser || (!isAppleUser && (!currentUser.firstName?.trim() || !currentUser.lastName?.trim()));
      if (profileIncomplete && segments[0] !== 'profile-setup') {
        router.replace('/profile-setup');
      } else if (!profileIncomplete && !inTabsGroup && !inAllowedModalGroup) {
        router.replace('/(tabs)');
      }
    } else if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)');
    }
  }, [isLoaded, isSignedIn, currentUser, currentUserSettled, segments, router, clerkUser]);

  useEffect(() => {
    if (isLoaded && ((isSignedIn && currentUserSettled) || !isSignedIn)) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded, isSignedIn, isSuccess]);

  // After sign-in with a complete profile, redeem any saved pending invite token.
  // This covers users who tapped a link while signed out and already had a profile.
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
      <WelcomeModal visible={showWelcomeModal} onClose={() => markWelcomeSeen.mutate()} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="profile-setup" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="account" options={{ presentation: 'modal', headerShown: true, title: 'Update Account' }} />
        <Stack.Screen name="group-edit-schedule" options={{ headerShown: false }} />
        <Stack.Screen name="group-edit-jit" options={{ headerShown: false }} />
        <Stack.Screen name="group-settings" options={{ headerShown: false }} />
        <Stack.Screen name="group-chat" options={{ headerShown: false }} />
        <Stack.Screen name="meetup-edit" options={{ headerShown: false }} />
        <Stack.Screen name="schedule-meetup" options={{ headerShown: false }} />
        <Stack.Screen name="add-members" options={{ headerShown: false }} />
        <Stack.Screen name="create-group" options={{ presentation: 'card', headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications'}} />
        <Stack.Screen name="join" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
};