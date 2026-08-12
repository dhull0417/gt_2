import React from 'react';
import { Stack } from 'expo-router';

// Nesting the chat under the Groups tab's own stack (rather than a
// top-level sibling route) keeps the native tab bar visible while a chat
// is open — leaving the tabs navigator entirely is what used to hide it.
export default function GroupsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" options={{ gestureEnabled: true }} />
    </Stack>
  );
}
