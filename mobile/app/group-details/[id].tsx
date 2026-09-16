import React from 'react';
import { GroupDetailsScreen } from '@/components/GroupDetailsScreen';

// iOS-only, outside (tabs): NativeTabs can't hide the tab bar for one nested screen and
// fires no re-tap event to reset it, so a screen outside Tabs avoids both problems.
// Android keeps the tab-nested version at (tabs)/groups/[id].tsx, which works fine there.
export default function GroupDetailsRoute() {
  return <GroupDetailsScreen showsTabBarBeneath={false} />;
}
