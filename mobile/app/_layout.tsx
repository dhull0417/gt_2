import { ClerkProvider, ClerkLoaded, ClerkLoading } from "@clerk/clerk-expo";
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserSync } from "@/hooks/useUserSync";
import { ActivityIndicator, View } from "react-native";
import "../global.css";

const queryClient = new QueryClient();

// We create a new component that contains the logic that needs to run *after* Clerk is loaded.
const InitialLayout = () => {
  // This hook will now only run when the user session is fully loaded and ready.
  useUserSync();

  // This Stack navigator renders your entire app.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
};

// The main RootLayout now focuses on providing the contexts and handling Clerk's loading state.
export default function RootLayout() {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    throw new Error('Missing Clerk Publishable Key');
  }

  return (
    <ClerkProvider 
      tokenCache={tokenCache}
      publishableKey={publishableKey}
    >
      <QueryClientProvider client={queryClient}>
        {/* Show a loading indicator while Clerk initializes */}
        <ClerkLoading>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator size="large" color="#4f46e5" />
          </View>
        </ClerkLoading>
        
        {/* Render the main app only after Clerk is fully loaded */}
        <ClerkLoaded>
          <InitialLayout />
        </ClerkLoaded>
      </QueryClientProvider>
    </ClerkProvider>
  );
}