import React from 'react';
import { Stack } from 'expo-router';

// Root-level (outside the (tabs) native tab navigator) so the native tab bar can
// never render on the chat screen — see (tabs)/groups/_layout.tsx for why that
// matters on Android.
export default function GroupChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // We use a custom header in the screen
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
