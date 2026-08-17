import React from 'react';
import { Stack } from 'expo-router';

// [id] here is the Group Details screen — kept nested under the Groups tab's
// stack so the native tab bar stays visible while browsing group info. The
// message thread itself lives at the root-level /group-chat/[id] route,
// entirely outside (tabs), which is what actually prevents the native tab
// bar from overlapping the keyboard/input on Android.
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
