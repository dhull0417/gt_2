import { Platform } from 'react-native';

// The native tab bar doesn't report its own height through the safe-area insets —
// insets.bottom only reflects the home-indicator/gesture-bar inset. expo-router's
// native-tabs has no measurement hook for it either, since it's a real native bar,
// not a JS view we could onLayout. So we pad by the OS's documented standard bar
// height on top of insets.bottom instead of trying to measure it.
export const TAB_BAR_HEIGHT = Platform.select({ ios: 49, android: 80, default: 49 });
