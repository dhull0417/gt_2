import React from 'react';
import { Stack } from 'expo-router';

/**
 * This layout file ensures that all screens within the /group-settings/ folder
 * are treated as part of a stack navigation, allowing for native headers
 * and standard back-swipe gestures.
 */
export default function GroupSettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // We use custom headers in our screens
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#F9FAFB' }
      }}
    >
      <Stack.Screen 
        name="[id]" 
        options={{ 
          title: 'Group Settings',
          gestureEnabled: true 
        }} 
      />
    </Stack>
  );
}