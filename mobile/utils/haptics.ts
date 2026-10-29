import * as Haptics from 'expo-haptics';

// Never throws: haptics are a nicety (simulators, some Android devices have none).
const safe = (fn: () => Promise<void>) => { try { fn().catch(() => {}); } catch {} };

/** Tactile feedback for the things people do. Light by default; success/warning/error for outcomes. */
export const haptic = {
  /** A normal button press. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A bigger action (RSVP, send, create). */
  press: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Moving between options (pickers, toggles, tabs). */
  select: () => safe(() => Haptics.selectionAsync()),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
