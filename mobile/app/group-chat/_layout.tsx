import React from 'react';
import { Stack } from 'expo-router';
import { useThemeColors } from '@/contexts/AppearanceContext';

// Kept outside (tabs) so the native tab bar never renders on chat (see (tabs)/groups/_layout.tsx, Android issue)
export default function GroupChatLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false, // custom header used in screen
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background }
      }}
    >
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Chat',
          gestureEnabled: true
        }}
      />
    </Stack>
  );
}
