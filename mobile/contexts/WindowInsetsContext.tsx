import { createContext, useContext } from 'react';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

// While the offline banner shows, app/_layout.tsx sets the top safe-area inset to 0 for screens
// (the banner already covers the status bar). Full-screen modals are drawn over the banner,
// from the very top of the screen, so they need the real insets: use useWindowInsets() there.
const WindowInsetsContext = createContext<EdgeInsets | null>(null);

export const WindowInsetsProvider = WindowInsetsContext.Provider;

export function useWindowInsets(): EdgeInsets {
  const real = useContext(WindowInsetsContext);
  const fromContext = useSafeAreaInsets();
  return real ?? fromContext;
}

// How far down the window screens start: the status bar online, the offline banner's measured
// height offline (see screenTopOffset in utils/offlineState.ts). Set in app/_layout.tsx.
const ScreenTopOffsetContext = createContext<number | null>(null);

export const ScreenTopOffsetProvider = ScreenTopOffsetContext.Provider;

/** For keyboardVerticalOffset and anything else that needs a screen's real distance from the top. */
export function useScreenTopOffset(): number {
  const offset = useContext(ScreenTopOffsetContext);
  const fallback = useSafeAreaInsets().top;
  return offset ?? fallback;
}
