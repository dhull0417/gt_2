import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
    <View
      pointerEvents="none"
      style={[styles.banner, { paddingTop: insets.top + 4 }]}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <Text style={styles.text}>You're offline — showing saved data</Text>
    </View>
  );
}

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
