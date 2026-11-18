import React from 'react';
import { Stack } from 'expo-router';
import { useThemeColors } from '@/contexts/AppearanceContext';

// Like every other root-level group-* route: without this layout the route registers as
// "group-members/[id]", which doesn't match the <Stack.Screen name="group-members"> in
// app/_layout.tsx, and the inner screen can pick up a default native header.
export default function GroupMembersLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false, // custom header used in screen
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="[id]" options={{ gestureEnabled: true }} />
    </Stack>
  );
}
