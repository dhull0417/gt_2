import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { haptic } from '@/utils/haptics';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  kind?: ToastKind;
  /** e.g. "Undo" - shown as a button on the toast. */
  actionLabel?: string;
  onAction?: () => void;
  /** How long it stays up. Default 3s (5s when there is an action). */
  durationMs?: number;
}

interface ToastApi {
  show: (opts: ToastOptions) => void;
  success: (message: string, extra?: Partial<ToastOptions>) => void;
  error: (message: string, extra?: Partial<ToastOptions>) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// Lets non-component code (mutation callbacks, utils) raise a toast too.
let externalShow: ((opts: ToastOptions) => void) | null = null;
export const toast = {
  show: (opts: ToastOptions) => externalShow?.(opts),
  success: (message: string, extra?: Partial<ToastOptions>) => externalShow?.({ message, kind: 'success', ...extra }),
  error: (message: string, extra?: Partial<ToastOptions>) => externalShow?.({ message, kind: 'error', ...extra }),
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<(ToastOptions & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent(null);
  }, []);

  const show = useCallback((opts: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    counter.current += 1;
    setCurrent({ ...opts, id: counter.current });
    if (opts.kind === 'error') haptic.error(); else if (opts.kind === 'success') haptic.success();
    timer.current = setTimeout(() => setCurrent(null), opts.durationMs ?? (opts.actionLabel ? 5000 : 3000));
  }, []);

  useEffect(() => {
    externalShow = show;
    return () => { externalShow = null; if (timer.current) clearTimeout(timer.current); };
  }, [show]);

  const api = useMemo<ToastApi>(() => ({
    show,
    success: (message, extra) => show({ message, kind: 'success', ...extra }),
    error: (message, extra) => show({ message, kind: 'error', ...extra }),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastHost toast={current} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastHost({ toast: t, onDismiss }: { toast: (ToastOptions & { id: number }) | null; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  if (!t) return null;
  const icon = t.kind === 'error' ? 'alert-circle' : t.kind === 'info' ? 'info' : 'check-circle';
  const iconColor = t.kind === 'error' ? colors.danger : t.kind === 'info' ? colors.brand : colors.success;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', paddingBottom: insets.bottom + 92, paddingHorizontal: 16 }]}>
      <Animated.View
        key={t.id}
        entering={FadeInDown.duration(220)}
        exiting={FadeOutDown.duration(180)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: colors.textPrimary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14,
          shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
        }}
      >
        <Feather name={icon} size={18} color={iconColor} />
        <Text style={{ flex: 1, color: colors.background, fontSize: 14, fontWeight: '600' }}>{t.message}</Text>
        {t.actionLabel && (
          <PressableOpacity
            onPress={() => { onDismiss(); t.onAction?.(); }}
            hitSlop={8}
          >
            <Text style={{ color: colors.brand, fontWeight: '800', fontSize: 14 }}>{t.actionLabel}</Text>
          </PressableOpacity>
        )}
      </Animated.View>
    </View>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Outside the provider (tests): fall back to the module-level emitter.
    return { show: toast.show, success: toast.success, error: toast.error };
  }
  return ctx;
}
