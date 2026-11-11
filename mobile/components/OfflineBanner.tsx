import { Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { offlineBannerText } from '@/utils/offlineState';

/**
 * Sits at the very top, in the normal layout flow (not floating over the screen), so every screen
 * below it is pushed down instead of having its header and back button covered. app/_layout.tsx
 * renders it above the navigator and zeroes the top inset for everything below while it shows.
 */
export function OfflineBanner({ segment }: { segment: string | undefined }) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(150)}
      style={[styles.banner, { paddingTop: insets.top + 4 }]}
      accessibilityRole="alert"
    >
      <Text style={styles.text}>{offlineBannerText(segment)}</Text>
    </Animated.View>
  );
}

// This banner is intentionally a fixed amber alert color in both themes (like a toast),
// so it isn't tokenized.
const styles = StyleSheet.create({
  banner: {
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
