// --- THIS IS THE FIX: Added SignedIn and SignedOut to the import ---
import { ClerkProvider, ClerkLoaded, ClerkLoading, SignedIn, SignedOut, useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useUserSync } from "@/hooks/useUserSync";
import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import { useApiClient, userApi, User } from "@/utils/api";
import * as SecureStore from 'expo-secure-store';
import "../global.css";

const queryClient = new QueryClient();

const tokenCache = {
    async getToken(key: string) {
        try {
            return SecureStore.getItemAsync(key);
        } catch (err) {
            return null;
        }
    },
    async saveToken(key: string, value: string) {
        try {
            return SecureStore.setItemAsync(key, value);
        } catch (err) {
            return;
        }
    },
};

const InitialLayout = () => {
  useUserSync();
  const router = useRouter();
  const api = useApiClient();

  const { data: currentUser, isSuccess } = useQuery<User, Error>({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

  useEffect(() => {
    if (isSuccess && currentUser) {
      const profileIncomplete = !currentUser.firstName || !currentUser.lastName;
      if (profileIncomplete) {
        router.replace({ pathname: '/profile-setup' as any });
      }
    }
  }, [currentUser, isSuccess, router]);

  if (!isSuccess) {
    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator size="large" color="#4f46e5" />
        </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
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
        {/* Shows a loading spinner until Clerk is ready */}
        <ClerkLoading>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator size="large" color="#4f46e5" />
          </View>
        </ClerkLoading>
        
        {/* Renders the main app ONLY when a user is signed in */}
        <SignedIn>
          <InitialLayout />
        </SignedIn>
        
        {/* Renders the auth flow ONLY when a user is signed out */}
        <SignedOut>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
          </Stack>
        </SignedOut>
      </QueryClientProvider>
    </ClerkProvider>
  );
}