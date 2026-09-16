import React from 'react';
import { Stack } from 'expo-router';

// Kept outside (tabs) so the native tab bar never renders on chat (see (tabs)/groups/_layout.tsx, Android issue)
export default function GroupChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // custom header used in screen
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'white' }
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
