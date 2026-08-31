import { Platform } from 'react-native';

// insets.bottom only covers the home-indicator, not the native tab bar (which
// can't be measured via onLayout since it's a real native view). So we hardcode
// each OS's documented tab bar height instead.
export const TAB_BAR_HEIGHT = Platform.select({ ios: 49, android: 80, default: 49 });
