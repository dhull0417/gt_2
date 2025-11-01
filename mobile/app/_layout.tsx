import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useUserSync } from "@/hooks/useUserSync";
import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import * as SecureStore from 'expo-secure-store';
import { User, useApiClient, userApi } from "@/utils/api";
import * as SplashScreen from 'expo-splash-screen';
import "../global.css";

SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient();
const tokenCache = {
    async getToken(key: string) {
        try { return SecureStore.getItemAsync(key); } catch (err) { return null; }
    },
    async saveToken(key: string, value: string) {
        try { return SecureStore.setItemAsync(key, value); } catch (err) { return; }
    },
};


const InitialLayout = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const api = useApiClient();
  useUserSync();
  const { data: currentUser, isSuccess } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
    enabled: !!isSignedIn,
  });

  // --- FIX: This is Hook 1 (Routing) ---
  // This hook runs on navigation to enforce routing rules.
  useEffect(() => {
    if (!isLoaded || (isSignedIn && !isSuccess)) return;

    const inTabsGroup = segments[0] === '(tabs)';
    const inAuthGroup = segments[0] === '(auth)';

    const inAllowedModalGroup = [
      'profile-setup', 
      'account', 
      'group-edit', 
      'event-edit', 
      'schedule-event', 
      'create-group', 
      'group', 
      'group-details'
    ].includes(segments[0]);

    if (isSignedIn) {
      const profileIncomplete = !currentUser?.firstName?.trim() || !currentUser?.lastName?.trim() || !currentUser?.username?.trim();

      if (profileIncomplete && segments[0] !== 'profile-setup') {
        router.replace('/profile-setup');
      } else if (!profileIncomplete && !inTabsGroup && !inAllowedModalGroup) {
        router.replace('/(tabs)');
      }
    } else if (!isSignedIn) {
      if (!inAuthGroup) {
        router.replace('/(auth)');
      }
    }
  }, [isLoaded, isSignedIn, currentUser, isSuccess, segments, router]);

  // --- FIX: This is Hook 2 (Splash Screen) ---
  // This hook only runs when auth is loaded, and never again.
  useEffect(() => {
    if (isLoaded) {
      // Hide splash screen once we know if user is signed in or not
      // and (if they are) we have their data
      if ((isSignedIn && isSuccess) || !isSignedIn) {
        SplashScreen.hideAsync();
      }
    }
  }, [isLoaded, isSignedIn, isSuccess]); // Note: No 'segments' or 'router'

  if (!isLoaded || (isSignedIn && !isSuccess)) {
     return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="profile-setup" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="account" options={{ presentation: 'modal', headerShown: true }} />
      <Stack.Screen name="group-edit" options={{ headerShown: false }} />
      <Stack.Screen name="event-edit" options={{ headerShown: false }} />
      <Stack.Screen name="schedule-event" options={{ headerShown: false }} />
      <Stack.Screen name="create-group" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="group" options={{ headerShown: true }} />
      <Stack.Screen name="group-details" options={{ headerShown: false }} />
    </Stack>
  );
};

export default function RootLayout() {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error('Missing Clerk Publishable Key');
  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
      <QueryClientProvider client={queryClient}>
          <InitialLayout />
      </QueryClientProvider>
    </ClerkProvider>
  );
}