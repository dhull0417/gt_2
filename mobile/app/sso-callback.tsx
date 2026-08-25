import { View } from 'react-native';
import { LoadingAnimation } from '@/components/LoadingAnimation';

// This component matches the "groupthat://sso-callback" route that Clerk's
// SSO flow redirects to once the Google auth session completes. On Android,
// expo-router's own linking listener picks up that deep link and mounts this
// screen *before* useSocialAuth's setActive() call has flipped isSignedIn.
// Redirecting to "/" here used to resolve to the sign-in screen and land the
// user back on it — a visible flash/slide back to sign-in before the app's
// routing effect (mobile/app/_layout.tsx) caught up and pushed to (tabs).
// Just showing a loading state avoids that: the root layout's routing effect
// takes the user straight to (tabs)/profile-setup once isSignedIn settles,
// and useSocialAuth routes back to sign-in explicitly if the flow fails.
export default function SsoCallback() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <LoadingAnimation />
    </View>
  );
}