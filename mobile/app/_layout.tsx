// app/_layout.tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useUserSync } from '@/hooks/useUserSync';
import * as SecureStore from 'expo-secure-store';
import { User, useApiClient, userApi } from '@/utils/api';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import "../global.css";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

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
        <QueryClientProvider client={queryClient}>
          <AuthLayout />
        </QueryClientProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

const AuthLayout = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const api = useApiClient();
  useUserSync();

  // ALWAYS call useQuery — but disable when not signed in
  const { data: currentUser, isSuccess } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
    enabled: isSignedIn, // Only runs when signed in
  });

  // === ROUTING LOGIC ===
  useEffect(() => {
    if (!isLoaded || (isSignedIn && !isSuccess)) return;

    const inTabsGroup = segments[0] === '(tabs)';
    const inAuthGroup = segments[0] === '(auth)';
    const inAllowedModalGroup = [
      'profile-setup',
      'account',
      'group-edit-schedule',
      'event-edit',
      'schedule-event',
      'create-group',
      'group',
      'group-details',
      'notifications'
    ].includes(segments[0]);

    if (isSignedIn) {
      const profileIncomplete = !currentUser?.firstName?.trim() || !currentUser?.lastName?.trim() || !currentUser?.username?.trim();
      if (profileIncomplete && segments[0] !== 'profile-setup') {
        router.replace('/profile-setup');
      } else if (!profileIncomplete && !inTabsGroup && !inAllowedModalGroup) {
        router.replace('/(tabs)');
      }
    } else if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)');
    }
  }, [isLoaded, isSignedIn, currentUser, isSuccess, segments, router]);

  // === SPLASH SCREEN ===
  useEffect(() => {
    if (isLoaded && ((isSignedIn && isSuccess) || !isSignedIn)) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded, isSignedIn, isSuccess]);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="profile-setup" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="account" options={{ presentation: 'modal', headerShown: true }} />
      <Stack.Screen name="group-edit-schedule" options={{ headerShown: false }} />
      <Stack.Screen name="event-edit" options={{ headerShown: false }} />
      <Stack.Screen name="schedule-event" options={{ headerShown: false }} />
      <Stack.Screen name="create-group" options={{ presentation: 'card', headerShown: false }} />      
      <Stack.Screen name="group-details" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications'}} />
    </Stack>
  );
};