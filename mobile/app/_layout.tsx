import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useUserSync } from "@/hooks/useUserSync";
import { ActivityIndicator, View } from "react-native";
import React, { useEffect } from "react";
import * as SecureStore from 'expo-secure-store';
import { User, useApiClient, userApi } from "@/utils/api";
import * as SplashScreen from 'expo-splash-screen';
import "../global.css";

// Prevent the splash screen from auto-hiding before we are ready.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Manually define the tokenCache object using SecureStore
const tokenCache = {
    async getToken(key: string) {
        try { return SecureStore.getItemAsync(key); } catch (err) { return null; }
    },
    async saveToken(key: string, value: string) {
        try { return SecureStore.setItemAsync(key, value); } catch (err) { return; }
    },
};

// This is the core component that manages the app's root navigation state.
const InitialLayout = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const api = useApiClient();
  
  useUserSync();

  const { data: currentUser, isSuccess } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
    enabled: !!isSignedIn, // Only run this query if the user is signed in
  });

  useEffect(() => {
    // Wait until Clerk is loaded AND the initial user fetch is complete if signed in.
    if (!isLoaded || (isSignedIn && !isSuccess)) {
      return;
    }

    const inTabsGroup = segments[0] === '(tabs)';
    
    if (isSignedIn) {
      const profileIncomplete = !currentUser?.firstName || !currentUser?.lastName;
      if (profileIncomplete) {
        router.replace('/profile-setup');
      } else if (!inTabsGroup) {
        router.replace('/(tabs)');
      }
    } else if (!isSignedIn) {
      // If the user is not signed in, route them to the auth flow.
      if (inTabsGroup) {
        router.replace('/(auth)');
      }
    }

    // Hide the splash screen once we've decided where to go.
    SplashScreen.hideAsync();

  }, [isLoaded, isSignedIn, currentUser, isSuccess, segments, router]);

  // Render a loading indicator or null while we wait for the checks to complete
  if (!isLoaded) {
     return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#4f46e5" />
        </View>
    );
  }

  // This single, unconditional Stack is what Expo Router needs.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="profile-setup" options={{ presentation: 'modal' }} />
    </Stack>
  );
};

export default function RootLayout() {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error('Missing Clerk Publishable Key');

  return (
    <ClerkProvider 
      tokenCache={tokenCache}
      publishableKey={publishableKey}
    >
      <QueryClientProvider client={queryClient}>
          <InitialLayout />
      </QueryClientProvider>
    </ClerkProvider>
  );
}