// Fade-up entrance: content rises 12px and fades into place. Plays when an item mounts
// (first load, scrolling into view) and replays when its FadeUpScreen comes back into focus.
// See docs/specs/2026-11-21-fade-up-entrance-design.md.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

export const FADE_UP = { offset: 12, duration: 320, stagger: 50, maxIndex: 8 };

// Cascade delay for the nth item on screen: 50ms apart, capped so the bottom never waits >400ms.
export const fadeUpDelay = (index?: number): number =>
  Math.min(Math.max(index ?? 0, 0), FADE_UP.maxIndex) * FADE_UP.stagger;

// startedAt: when the screen appeared or last replayed. A row's cascade delay counts from then,
// so a row that mounts later (scrolled into view) starts at once instead of waiting.
// hidden: the screen is out of view. Content is hidden then, so coming back never shows a stale
// fully-visible frame before the fade (tabs stay mounted in the background).
type FadeUpContextValue = { token: number; replay: () => void; startedAt?: number; hidden?: boolean };

// Exported for tests; screens use FadeUpScreen / useFadeUpReplay.
export const FadeUpContext = createContext<FadeUpContextValue>({ token: 0, replay: () => {} });

type FadeUpProps = {
  /** Position on screen, for the top-to-bottom cascade. Omit for no delay. */
  index?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const FadeUp = ({ index, children, style, testID }: FadeUpProps) => {
  const { token, startedAt, hidden } = useContext(FadeUpContext);
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  // Runs on mount and on each screen replay only — never on ordinary re-renders (RSVP taps,
  // refetches), so content already on screen stays still.
  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    if (hidden) return;
    const elapsed = startedAt === undefined ? 0 : Date.now() - startedAt;
    progress.value = withDelay(
      Math.max(0, fadeUpDelay(index) - elapsed),
      withTiming(1, { duration: FADE_UP.duration, easing: Easing.out(Easing.cubic) }),
    );
    // index is deliberately left out: a row shifting position must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hidden, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * FADE_UP.offset }],
  }));

  return (
    <Animated.View testID={testID} style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
};

// The splash screen covers the app at launch while tabs are already built, so nothing may fade
// up before it's gone. The root layout calls markAppRevealed() once the splash has hidden.
let appRevealed = false;
const revealListeners = new Set<() => void>();
export const markAppRevealed = () => {
  if (appRevealed) return;
  appRevealed = true;
  revealListeners.forEach(listener => listener());
};
/** Tests only: put the splash back. */
export const resetAppRevealedForTests = () => { appRevealed = false; };
const subscribeReveal = (listener: () => void) => {
  revealListeners.add(listener);
  return () => { revealListeners.delete(listener); };
};
const useAppRevealed = () => useSyncExternalStore(subscribeReveal, () => appRevealed);

// Wrap a screen's content: every FadeUp inside stays hidden until the screen is actually in view
// (focused, splash gone), then cascades in. Every visit replays, the first included: tabs are
// built at launch, before they're shown, so "mounted" doesn't mean "seen". Content is hidden
// again on blur, while off-screen, so a return starts hidden instead of flashing the old frame.
export const FadeUpScreen = ({ children }: { children: React.ReactNode }) => {
  const [cycle, setCycle] = useState(() => ({ token: 0, startedAt: Date.now(), hidden: true }));
  const replay = useCallback(() => setCycle(c => ({ token: c.token + 1, startedAt: Date.now(), hidden: false })), []);
  const hide = useCallback(() => setCycle(c => (c.hidden ? c : { ...c, hidden: true })), []);

  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false); // runs on blur
  }, []));
  const revealed = useAppRevealed();

  useEffect(() => {
    if (focused && revealed) replay();
    else hide();
  }, [focused, revealed, replay, hide]);

  const value = useMemo(() => ({ ...cycle, replay }), [cycle, replay]);
  return <FadeUpContext.Provider value={value}>{children}</FadeUpContext.Provider>;
};

/** Manually replay the cascade for the current FadeUpScreen. */
export const useFadeUpReplay = () => useContext(FadeUpContext).replay;
