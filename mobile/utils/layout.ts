import { Platform } from 'react-native';

// insets.bottom only covers the home-indicator, not the native tab bar (which
// can't be measured via onLayout since it's a real native view). So we hardcode
// each OS's documented tab bar height instead.
export const TAB_BAR_HEIGHT = Platform.select({ ios: 49, android: 80, default: 49 });

/**
 * Bottom padding for a scrolling screen inside the tabs so its last row clears the tab bar.
 * iOS's native tab bar floats over the screen. Android's custom tab bar (AndroidTabBar) is laid
 * out below the screen instead, so adding its height there only left a large blank gap.
 */
export const tabScreenBottomPadding = (bottomInset: number) =>
  Platform.OS === 'android' ? 16 : bottomInset + TAB_BAR_HEIGHT;
