import { Stack } from 'expo-router';
import React from 'react';
import { useThemeColors } from '@/contexts/AppearanceContext';

// The screen draws its own header bar, so hide the stack's.
export default function Layout() {
  const colors = useThemeColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="[meetupId]" options={{ headerShown: false }} />
    </Stack>
  );
}
