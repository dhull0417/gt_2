import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from './useIsOnline';

// OfflineBanner renders above the root Stack and reserves the device's own
// top safe-area inset for itself while offline (see components/OfflineBanner.tsx).
// A screen that also reserves insets.top for its own top edge would then be
// double-counting that space, pushing content (chat input, tab bar, ...) off
// screen. Screens should use this instead of a raw insets.top for their top
// padding/edges so the two never stack.
export function useContentTopInset(): number {
  const insets = useSafeAreaInsets();
  const isOnline = useIsOnline();
  return isOnline ? insets.top : 0;
}
