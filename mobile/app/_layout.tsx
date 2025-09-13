import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserSync } from "@/hooks/useUserSync";
import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import * as SecureStore from 'expo-secure-store';
import "../global.css";

const queryClient = new QueryClient();

const tokenCache = {
    async getToken(key: string) {
        try { return SecureStore.getItemAsync(key); } catch (err) { return null; }
    },
    async saveToken(key: string, value: string) {
        try { return SecureStore.setItemAsync(key, value); } catch (err) { return; }
    },
};

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
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="profile-setup" options={{ presentation: 'modal' }}/>
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
          <RootLayoutNav />
      </QueryClientProvider>
    </ClerkProvider>
  );
}