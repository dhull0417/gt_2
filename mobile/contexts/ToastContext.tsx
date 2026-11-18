import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, StyleSheet, Keyboard, Platform } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { haptic } from '@/utils/haptics';
import { friendlyErrorText } from '@/utils/networkError';

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

// A React Native <Modal> is its own native window, drawn above the whole app - including the toast
// at the app root. So a toast raised while one is open (e.g. "You're offline" when cancelling a
// meetup from the meetup sheet) was hidden behind it. Screens put a <ToastPortal /> inside their
// Modal; the toast is drawn in the most recently opened one, or at the root when none is open.
interface PortalApi {
  register: (id: number) => void;
  unregister: (id: number) => void;
  activePortal: number | null;
  current: (ToastOptions & { id: number }) | null;
  dismiss: () => void;
}
const PortalContext = createContext<PortalApi | null>(null);
let portalCounter = 0;

// Lets non-component code (mutation callbacks, utils) raise a toast too.
let externalShow: ((opts: ToastOptions) => void) | null = null;
export const toast = {
  show: (opts: ToastOptions) => externalShow?.(opts),
  success: (message: string, extra?: Partial<ToastOptions>) => externalShow?.({ message, kind: 'success', ...extra }),
  error: (message: string, extra?: Partial<ToastOptions>) => externalShow?.({ message, kind: 'error', ...extra }),
  info: (message: string, extra?: Partial<ToastOptions>) => externalShow?.({ message, kind: 'info', ...extra }),
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<(ToastOptions & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent(null);
  }, []);

  // Open portals, oldest first; the last one is on top.
  const [portals, setPortals] = useState<number[]>([]);
  const register = useCallback((id: number) => setPortals((p) => [...p, id]), []);
  const unregister = useCallback((id: number) => setPortals((p) => p.filter((x) => x !== id)), []);
  const activePortal = portals.length ? portals[portals.length - 1] : null;

  const show = useCallback((opts: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    counter.current += 1;
    // Last line of defense: never show a library's raw "Network Error" / "Network request failed".
    setCurrent({ ...opts, message: friendlyErrorText(opts.message), id: counter.current });
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

  const portalApi = useMemo<PortalApi>(
    () => ({ register, unregister, activePortal, current, dismiss }),
    [register, unregister, activePortal, current, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      <PortalContext.Provider value={portalApi}>
        {children}
        {activePortal === null && <ToastHost toast={current} onDismiss={dismiss} />}
      </PortalContext.Provider>
    </ToastContext.Provider>
  );
}

/**
 * Put this as the last child inside a React Native <Modal> (or a component that is the whole
 * content of one), so toasts raised while it's open show on top of it instead of behind it.
 */
export function ToastPortal() {
  const ctx = useContext(PortalContext);
  const [id] = useState(() => ++portalCounter);
  const register = ctx?.register;
  const unregister = ctx?.unregister;
  useEffect(() => {
    if (!register || !unregister) return;
    register(id);
    return () => unregister(id);
  }, [id, register, unregister]);
  if (!ctx || ctx.activePortal !== id) return null;
  return <ToastHost toast={ctx.current} onDismiss={ctx.dismiss} />;
}

// Toasts sit near the bottom; with the keyboard up (e.g. the chat's edit box) they'd be behind it.
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

function ToastHost({ toast: t, onDismiss }: { toast: (ToastOptions & { id: number }) | null; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const keyboardHeight = useKeyboardHeight();
  if (!t) return null;
  const icon = t.kind === 'error' ? 'alert-circle' : t.kind === 'info' ? 'info' : 'check-circle';
  const iconColor = t.kind === 'error' ? colors.danger : t.kind === 'info' ? colors.brand : colors.success;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : insets.bottom + 92, paddingHorizontal: 16 }]}>
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
