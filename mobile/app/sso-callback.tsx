import { View } from 'react-native';
import { LoadingAnimation } from '@/components/LoadingAnimation';

// Handles Clerk's SSO redirect deep link, which on Android can mount before isSignedIn
// updates. Just show loading — root layout's routing effect takes over once it settles.
export default function SsoCallback() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <LoadingAnimation />
    </View>
  );
}