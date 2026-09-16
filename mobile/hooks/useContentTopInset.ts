import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from './useIsOnline';
import { useOfflineBannerHeight } from '@/contexts/OfflineBannerContext';

export function useContentTopInset(): number {
  const insets = useSafeAreaInsets();
  const isOnline = useIsOnline();
  const bannerHeight = useOfflineBannerHeight();
  return isOnline ? insets.top : bannerHeight;
}
