import React from 'react';
import { Stack } from 'expo-router';

export default function GroupEditJitLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // custom header used in screen
        animation: 'slide_from_bottom', // matches group creation flow
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