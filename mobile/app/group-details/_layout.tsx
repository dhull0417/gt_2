import React from 'react';
import { Stack } from 'expo-router';

// Root-level (outside the (tabs) native tab navigator) so the native tab bar
// can never render on Group Details for iOS — see (tabs)/groups/_layout.tsx
// and this screen's own comment for why that matters. Mirrors group-chat's
// own _layout.tsx: without this, the root Stack.Screen's headerShown:false
// (in app/_layout.tsx) isn't enough on its own — the inner [id] screen still
// picks up a default native header.
export default function GroupDetailsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // We use a custom header in the screen
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'white' },
      }}
    >
      <Stack.Screen name="[id]" options={{ gestureEnabled: true }} />
    </Stack>
  );
}
