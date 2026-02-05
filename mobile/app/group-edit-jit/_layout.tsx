import React from 'react';
import { Stack } from 'expo-router';

/**
 * Layout for the group-edit-jit route group.
 * Ensures smooth transitions and standard stack behavior for the JIT edit screen.
 */
export default function GroupEditJitLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // Custom creation-style header is used within the screen
        animation: 'slide_from_bottom', // Consistent with the group creation flow feel
        contentStyle: { backgroundColor: '#F9FAFB' }
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