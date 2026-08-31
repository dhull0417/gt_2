import React from 'react';
import { Stack } from 'expo-router';

// [id] is Android's Group Details, nested here so the tab bar stays visible/resettable
// (AndroidTabBar.tsx); iOS has its own copy at group-details/[id].tsx. Chat itself lives
// at the root-level /group-chat/[id] on both platforms, outside (tabs), so the tab bar
// never overlaps the keyboard on Android.
export default function GroupsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" options={{ gestureEnabled: true, headerShown: false }} />
    </Stack>
  );
}
