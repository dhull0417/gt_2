import React from 'react';
import { Stack } from 'expo-router';

export default function GroupSettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // custom headers used in screens
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