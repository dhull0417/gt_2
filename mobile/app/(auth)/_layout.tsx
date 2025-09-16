import { Redirect, Stack } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'
import { View, ActivityIndicator } from 'react-native';

export default function AuthRoutesLayout() {
  const { isSignedIn, isLoaded } = useAuth()

  if (!isLoaded) {
    // Show a loading spinner while Clerk loads
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" />
        </View>
    );
  }

  // If the user is signed in, redirect them away from the auth screens.
  if (isSignedIn) {
    return <Redirect href={"/(tabs)"} />
  }

  // If the user is not signed in, show the auth screens.
  return <Stack screenOptions={{headerShown: false}}/>
}