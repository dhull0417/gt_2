import React from 'react';
import { Stack } from 'expo-router';
import { useThemeColors } from '@/contexts/AppearanceContext';

export default function GroupEditJitLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false, // custom header used in screen
        animation: 'slide_from_bottom', // matches group creation flow
        contentStyle: { backgroundColor: colors.background }
      }}
    >
      <Stack.Screen
        name="[id]"
        options={{
          presentation: 'card',
          gestureEnabled: true
        }}
      />
    </Stack>
  );
}
