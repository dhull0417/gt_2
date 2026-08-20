import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(onlineManager.isOnline());
  const insets = useSafeAreaInsets();

  useEffect(() => onlineManager.subscribe(setIsOnline), []);

  if (isOnline) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 4 }]}>
      <Text style={styles.text}>You're offline — showing saved data</Text>
    </View>
  );
}

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
