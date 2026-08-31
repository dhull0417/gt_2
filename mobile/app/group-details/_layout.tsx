import React from 'react';
import { Stack } from 'expo-router';

// Root-level so the tab bar never renders here on iOS (see [id].tsx). Mirrors group-chat's
// layout: app/_layout.tsx's headerShown:false alone doesn't stop the inner screen from
// picking up a default native header.
export default function GroupDetailsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // custom header used in screen
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'white' },
      }}
    >
      <Stack.Screen name="[id]" options={{ gestureEnabled: true }} />
    </Stack>
  );
}
