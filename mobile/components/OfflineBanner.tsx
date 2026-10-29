import { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useSetOfflineBannerHeight } from '@/contexts/OfflineBannerContext';

export function OfflineBanner() {
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();
  const setHeight = useSetOfflineBannerHeight();

  useEffect(() => {
    if (isOnline) setHeight(0);
  }, [isOnline, setHeight]);

  if (isOnline) return null;

  return (
    <Animated.View
      entering={SlideInUp.duration(220)}
      exiting={SlideOutUp.duration(180)}
      pointerEvents="none"
      style={[styles.banner, { paddingTop: insets.top + 4 }]}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <Text style={styles.text}>You're offline — showing saved data</Text>
    </Animated.View>
  );
}

// This banner is intentionally a fixed amber alert color in both themes (like a toast),
// so it isn't tokenized.
const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: '#D97706',
    paddingBottom: 6,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
