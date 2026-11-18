import React from 'react';
import { Stack } from 'expo-router';
import { useThemeColors } from '@/contexts/AppearanceContext';

// Root-level route like the other group screens: the screen draws its own header.
export default function Layout() {
  const colors = useThemeColors();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="[id]" options={{ gestureEnabled: true }} />
    </Stack>
  );
}
