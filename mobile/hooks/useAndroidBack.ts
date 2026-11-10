import { useCallback, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * While the screen is focused and `enabled`, Android's back button/gesture runs `handler`
 * instead of leaving the screen. Use it to make back match the on-screen back arrow
 * (e.g. step out of a code-entry step). No-op on iOS.
 */
export function useAndroidBack(enabled: boolean, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !enabled) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        ref.current();
        return true;
      });
      return () => sub.remove();
    }, [enabled]),
  );
}
