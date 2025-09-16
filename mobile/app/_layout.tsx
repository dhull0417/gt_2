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

  useEffect(() => {
    if (!isLoaded || (isSignedIn && !isSuccess)) {
      return;
    }

    // --- THIS IS THE FIX ---
    const inTabsGroup = segments[0] === '(tabs)';
    
    if (isSignedIn) {
      const profileIncomplete = !currentUser?.firstName || !currentUser?.lastName;
      if (profileIncomplete) {
        router.replace('/profile-setup');
      } else if (!inTabsGroup) {
        router.replace('/(tabs)');
      }
    } else if (!isSignedIn) {
      if (inTabsGroup) {
        router.replace('/(auth)');
      }
    }
    
    SplashScreen.hideAsync();
  }, [isLoaded, isSignedIn, currentUser, isSuccess, segments, router]);

  if (!isLoaded || (isSignedIn && !isSuccess)) {
     return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#4f46e5" />
        </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="profile-setup" options={{ presentation: 'modal' }} />
      <Stack.Screen name="account" />
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