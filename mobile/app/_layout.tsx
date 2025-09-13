import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserSync } from "@/hooks/useUserSync";
import { useEffect } from "react";
import * as SecureStore from 'expo-secure-store';
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

const RootLayoutNav = () => {
  const { isLoaded } = useAuth();
  
  // This hook runs once Clerk is loaded and the user is signed in.
  useUserSync();

  // This effect's only job is to hide the splash screen when Clerk is ready.
  useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded]);

  // Render nothing until Clerk is loaded to prevent screen flicker.
  if (!isLoaded) {
    return null;
  }

  // This single, unconditional Stack provides a stable foundation for the app.
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
          <RootLayoutNav />
      </QueryClientProvider>
    </ClerkProvider>
  );
}