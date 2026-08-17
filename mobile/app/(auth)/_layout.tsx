import { Redirect, Stack } from 'expo-router'
import { useAuth } from '@clerk/expo'
import { View } from 'react-native';
import { LoadingAnimation } from '@/components/LoadingAnimation';

export default function AuthRoutesLayout() {
  const { isSignedIn, isLoaded } = useAuth()

  if (!isLoaded) {
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <LoadingAnimation />
        </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href={"/(tabs)"} />
  }

  return <Stack screenOptions={{headerShown: false}}/>
}