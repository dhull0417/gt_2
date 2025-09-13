import { ClerkProvider, ClerkLoaded, ClerkLoading } from "@clerk/clerk-expo";
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { Stack, useRouter } from "expo-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useUserSync } from "@/hooks/useUserSync";
import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import { useApiClient, userApi } from "@/utils/api";
import "../global.css";

const queryClient = new QueryClient();

const InitialLayout = () => {
  useUserSync();
  const router = useRouter();
  const api = useApiClient();

  const { data: currentUser, isSuccess } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => userApi.getCurrentUser(api),
  });

  useEffect(() => {
    if (isSuccess && currentUser) {
      const profileIncomplete = !currentUser.firstName || !currentUser.lastName;

      if (profileIncomplete) {
        // --- THIS IS THE FIX ---
        // Use the object syntax for the redirect to satisfy typed routes.
        router.replace({ pathname: '/profile-setup' as any });      }
    }
  }, [currentUser, isSuccess, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile-setup" options={{ headerShown: false }} />
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
        <ClerkLoading>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator size="large" color="#4f46e5" />
          </View>
        </ClerkLoading>
        
        <ClerkLoaded>
          <InitialLayout />
        </ClerkLoaded>
      </QueryClientProvider>
    </ClerkProvider>
  );
}