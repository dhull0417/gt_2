import React from 'react';
import { Stack } from 'expo-router';

export default function GroupLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // We use a custom header in the screen
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="[id]" options={{ gestureEnabled: true }} />
    </Stack>
  );
}
