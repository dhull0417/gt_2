import React from 'react';
import { GroupDetailsScreen } from '@/components/GroupDetailsScreen';

// iOS-only entry point for Group Details, living entirely outside (tabs) —
// same reasoning as /group-chat: a screen outside the Tabs tree never shows
// the native tab bar in the first place. We need that here because
// expo-router's NativeTabs has no way to hide the tab bar for a single
// screen nested inside a tab's own stack, and (unlike Android's JS tab bar)
// fires no JS event when the already-active tab is tapped again — so there's
// no way to reset back to the list from within that stack either. Android
// keeps using the tab-nested version at app/(tabs)/groups/[id].tsx, where
// the tab bar staying visible is actually useful and already works.
export default function GroupDetailsRoute() {
  return <GroupDetailsScreen showsTabBarBeneath={false} />;
}
