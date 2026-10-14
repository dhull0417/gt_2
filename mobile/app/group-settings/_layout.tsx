import React from 'react';
import { Stack } from 'expo-router';
import { useThemeColors } from '@/contexts/AppearanceContext';

export default function GroupSettingsLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false, // custom headers used in screens
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background }
      }}
    >
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Group Settings',
          gestureEnabled: true
        }}
      />
    </Stack>
  );
}