import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme as nativewindColorScheme, useColorScheme as useNativewindColorScheme } from 'nativewind';
import { darkColors, lightColors, ThemeColors } from '@/constants/theme';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'gt2-theme-preference';

type AppearanceContextValue = {
  // What the user picked on the Profile screen.
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  // What's actually being rendered right now ('system' resolved to light/dark).
  scheme: 'light' | 'dark';
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export const AppearanceProvider = ({ children }: { children: React.ReactNode }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  // NativeWind's own resolved scheme — this is what actually drives `dark:` classNames,
  // so we mirror it here rather than keeping a second source of truth.
  const { colorScheme } = useNativewindColorScheme();

  // Load the persisted choice once on launch and hand it to NativeWind, which is what
  // actually flips `dark:` classNames app-wide (colorScheme.set persists only in memory,
  // so without this every cold start would fall back to the OS setting).
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
        nativewindColorScheme.set(stored);
      }
    }).catch(() => {});
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    nativewindColorScheme.set(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const value = useMemo<AppearanceContextValue>(() => ({
    preference,
    setPreference,
    scheme: colorScheme ?? 'light',
  }), [preference, colorScheme]);

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
};

export const useAppearance = (): AppearanceContextValue => {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within an AppearanceProvider');
  return ctx;
};

// Resolved color tokens for the current scheme — for JS-side values (icon `color`
// props, computed `backgroundColor`, etc). Prefer NativeWind `dark:` classNames
// directly wherever a plain className will do.
export const useThemeColors = (): ThemeColors => {
  const { scheme } = useAppearance();
  return scheme === 'dark' ? darkColors : lightColors;
};
