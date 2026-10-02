import { Stack } from 'expo-router';
import React from 'react';

// The screen draws its own header bar, so hide the stack's.
export default function GroupPriorityLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
