import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

export default function AuthRoutesLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return null; // or a loading spinner
  }

  // If the user is signed in, redirect them away from the auth screens.
  if (isSignedIn) {
    return <Redirect href={"/(tabs)"} />
  }

  // If the user is not signed in, show the auth screens.
  return <Stack screenOptions={{headerShown: false}}/>
}