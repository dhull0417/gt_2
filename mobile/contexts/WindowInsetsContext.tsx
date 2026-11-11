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
