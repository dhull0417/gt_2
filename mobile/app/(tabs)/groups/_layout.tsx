import React from 'react';
import { Stack } from 'expo-router';

// [id] here is Android's Group Details screen — kept nested under the Groups
// tab's stack so the native tab bar stays visible while browsing group info,
// and can be reset back to the list by tapping the tab again (AndroidTabBar.tsx).
// iOS uses a separate root-level copy at app/group-details/[id].tsx instead,
// because its native tab bar can't be hidden for one nested screen and has no
// way to reset itself — see that file. The message thread itself lives at the
// root-level /group-chat/[id] route on both platforms, entirely outside
// (tabs), which is what actually prevents the native tab bar from overlapping
// the keyboard/input on Android.
export default function GroupsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" options={{ gestureEnabled: true, headerShown: false }} />
    </Stack>
  );
}
