import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter, useSegments } from "expo-router";
<<<<<<< HEAD
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useUserSync } from "@/hooks/useUserSync";
import { ActivityIndicator, View } from "react-native";
import React, { useEffect } from "react";
import * as SecureStore from 'expo-secure-store';
import { User, useApiClient, userApi } from "@/utils/api";
import * as SplashScreen from 'expo-splash-screen';
=======
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserSync } from "@/hooks/useUserSync";
import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import * as SecureStore from 'expo-secure-store';
>>>>>>> 6cf540d932bcb9a4632f33d6e30738fbdbedcf53
import "../global.css";

// Prevent the splash screen from auto-hiding before we are ready.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

<<<<<<< HEAD
// Manually define the tokenCache object using SecureStore
=======
>>>>>>> 6cf540d932bcb9a4632f33d6e30738fbdbedcf53
const tokenCache = {
    async getToken(key: string) {
        try { return SecureStore.getItemAsync(key); } catch (err) { return null; }
    },
    async saveToken(key: string, value: string) {
        try { return SecureStore.setItemAsync(key, value); } catch (err) { return; }
    },
};
<<<<<<< HEAD

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
=======

// This is the core component that manages the app's root navigation state.
const RootLayoutNav = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  // This hook handles the user sync process.
  useUserSync();

  useEffect(() => {
    if (!isLoaded) return;

    const inTabsGroup = segments[0] === '(tabs)';

    if (isSignedIn && !inTabsGroup) {
      // Redirect to the main app if the user is signed in and not already there.
      router.replace('/(tabs)');
    } else if (!isSignedIn && inTabsGroup) {
      // Redirect to the auth flow if the user is signed out.
      router.replace('/(auth)');
    }
  }, [isSignedIn, isLoaded, segments, router]);

  // Show a loading spinner until Clerk is ready
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // This single, unconditional Stack is what Expo Router needs to see.
>>>>>>> 6cf540d932bcb9a4632f33d6e30738fbdbedcf53
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
<<<<<<< HEAD
      <Stack.Screen name="profile-setup" options={{ presentation: 'modal' }} />
=======
      <Stack.Screen name="profile-setup" options={{ presentation: 'modal' }}/>
>>>>>>> 6cf540d932bcb9a4632f33d6e30738fbdbedcf53
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
<<<<<<< HEAD
          <InitialLayout />
=======
          <RootLayoutNav />
>>>>>>> 6cf540d932bcb9a4632f33d6e30738fbdbedcf53
      </QueryClientProvider>
    </ClerkProvider>
  );
}