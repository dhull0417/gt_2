// Calm form kit: grouped cards of one-line summary rows that open sheets.
// Spec: docs/specs/2026-11-19-calmer-meetup-forms-design.md
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, useWindowDimensions, Platform,
  LayoutAnimation, UIManager, Keyboard, TextInput,
} from 'react-native';
import type { ScrollViewInstance, ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import InfoBubble from '@/components/InfoBubble';
import type { ThemeColors } from '@/constants/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
/** Call right before a change that adds, removes, opens or collapses something, so it eases into place. */
export const animateLayout = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));

export const makeFormStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, paddingVertical: 10 },
  rowError: { borderWidth: 1, borderColor: colors.danger, borderRadius: 12, margin: 2 },
  label: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  value: { flex: 1, textAlign: 'right', fontSize: 15, color: colors.textMuted },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  fieldError: { fontSize: 12, fontWeight: '600', color: colors.danger, marginTop: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  optionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  done: { fontSize: 16, fontWeight: '800', color: colors.brand },
});

export const useFormStyles = () => {
  const colors = useThemeColors();
  return useMemo(() => makeFormStyles(colors), [colors]);
};

/** A plain card whose children are separated by hairlines (grouped-list style). */
export function GroupCard({ children, style }: { children: React.ReactNode; style?: object }) {
  const colors = useThemeColors();
  const s = useFormStyles();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[s.card, { overflow: 'hidden' }, style]}>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View testID="group-divider" style={{ height: 1, backgroundColor: colors.border, marginLeft: 14 }} />}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * One setting on one line: label left, current value and a chevron right.
 * `disabledReason` greys it out; `error` turns it red with the instruction in place of the value;
 * `locked` marks a Premium-only setting; `right` replaces value + chevron with a control (e.g. a switch);
 * `info` adds an "i" after the label that opens an explainer.
 */
export function SummaryRow({ label, value, onPress, disabledReason, error, locked, right, info, testID, onLayoutY }: {
  label: string; value: string; onPress: () => void; disabledReason?: string; error?: string | null; locked?: boolean;
  right?: React.ReactNode; info?: { title: string; description: string }; testID?: string; onLayoutY?: (y: number) => void;
}) {
  const colors = useThemeColors();
  const s = useFormStyles();
  const disabled = !!disabledReason;
  const shown = disabledReason ?? error ?? (locked ? 'Premium' : value);
  return (
    <PressableOpacity testID={testID} onPress={onPress} disabled={disabled} accessibilityRole="button"
      accessibilityLabel={`${label}: ${shown}`} accessibilityState={{ disabled }}
      onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}
      style={[s.row, !!error && s.rowError, disabled && { opacity: 0.45 }]}>
      <Text style={[s.label, { flexShrink: 0 }, !!error && { color: colors.danger }]}>{label}</Text>
      {info && <InfoBubble title={info.title} description={info.description} />}
      {right ? <View testID="row-right" style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginLeft: 'auto' }}>{right}</View> : (
        <>
          <Text style={[s.value, !!error && { color: colors.danger, fontWeight: '600' }]} numberOfLines={2}>{shown}</Text>
          {locked && <Feather testID="row-lock" name="lock" size={14} color={colors.textFaint} />}
          {!disabled && <Feather testID="row-chevron" name="chevron-right" size={18} color={error ? colors.danger : colors.textFaint} />}
        </>
      )}
    </PressableOpacity>
  );
}

/** Red instruction under a field inside a sheet. Renders nothing without a message. */
export function FieldError({ message }: { message?: string | null }) {
  const s = useFormStyles();
  return message ? <Text style={s.fieldError}>{message}</Text> : null;
}

export function OptionRow({ label, sub, selected, onPress, disabled, check = 'radio' }: {
  label: string; sub?: string; selected: boolean; onPress: () => void; disabled?: boolean; check?: 'radio' | 'box';
}) {
  const colors = useThemeColors();
  const s = useFormStyles();
  const icon = check === 'box' ? (selected ? 'check-square' : 'square') : (selected ? 'check-circle' : 'circle');
  return (
    <PressableOpacity onPress={onPress} disabled={disabled} style={[s.option, disabled && { opacity: 0.5 }]}
      accessibilityRole={check === 'box' ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected, disabled }}>
      <Feather name={icon as any} size={20} color={selected ? colors.brand : colors.textFaint} />
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{label}</Text>
        {sub ? <Text style={s.optionSub}>{sub}</Text> : null}
      </View>
    </PressableOpacity>
  );
}

/**
 * Bottom sheet for one setting's details. Done and the backdrop close it (and Android back, as a Modal).
 * `asOverlay` draws it as a layer inside the current screen instead of a native Modal — required inside
 * another Modal (e.g. MeetupForm), where iOS can't present a second one. The host handles Android back then.
 */
/**
 * The sheet's height: tall sheets are a fixed 88% of the screen, but never taller than the space
 * left above the keyboard (otherwise the keyboard pushes the sheet, and the field being typed in,
 * off the top of the screen).
 */
export const sheetHeight = ({ window, keyboard, topInset, tall }: { window: number; keyboard: number; topInset: number; tall: boolean }) => {
  const h = Math.min(Math.round(window * 0.88), window - keyboard - topInset - 12);
  return tall ? { height: h } : { maxHeight: h };
};

/**
 * How much room to leave for the keyboard. Some phones already shrink the screen for the keyboard
 * (then nothing is needed); others don't, and the sheet must lift itself. `base` is the sheet
 * area's height with no keyboard, `now` its current height.
 */
export const keyboardPadding = ({ keyboard, base, now }: { keyboard: number; base: number; now: number }) =>
  keyboard > 0 && base > 0 && now >= base - 1 ? keyboard : 0;

/** Current keyboard height (0 when hidden). Modals aren't resized for the keyboard, so sheets pad themselves. */
function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

/** Lets fields inside a sheet show a picker on top of the whole sheet (no second native Modal). */
const OverlayContext = createContext<{ show: (node: ReactNode) => void; hide: () => void } | null>(null);
export const useSheetOverlay = () => useContext(OverlayContext);

export function SettingSheet({ visible, title, onClose, onDone, children, asOverlay, tall }: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode; asOverlay?: boolean;
  /** What Done does (defaults to onClose), e.g. check the entries before closing. */
  onDone?: () => void;
  /** Fixed tall height, for sheets whose content grows and shrinks (e.g. When), so the sheet doesn't jump. */
  tall?: boolean;
}) {
  const colors = useThemeColors();
  const s = useFormStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const [area, setArea] = useState({ base: 0, now: 0 });
  const pad = keyboardPadding({ keyboard, base: area.base, now: area.now });
  const scrollRef = useRef<ScrollViewInstance>(null);
  const contentRef = useRef<ViewInstance>(null);
  // When the keyboard opens, bring the field being typed in into view inside the (now shorter) sheet.
  useEffect(() => {
    if (!keyboard) return;
    const t = setTimeout(() => {
      const input = (TextInput as any).State?.currentlyFocusedInput?.();
      if (!input || !contentRef.current || !scrollRef.current) return;
      input.measureLayout(contentRef.current, (_x: number, y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 60), animated: true }), () => {});
    }, 60);
    return () => clearTimeout(t);
  }, [keyboard]);
  const [overlay, setOverlay] = useState<ReactNode>(null);
  const ctx = useMemo(() => ({ show: (n: ReactNode) => setOverlay(n), hide: () => setOverlay(null) }), []);
  useEffect(() => { if (!visible) setOverlay(null); }, [visible]);
  if (!visible) return null;
  const body = (
    <OverlayContext.Provider value={ctx}>
      <View style={{ flex: 1, backgroundColor: colors.overlay }}
        onLayout={e => { const h = e.nativeEvent.layout.height; setArea(a => ({ base: Math.max(a.base, h), now: h })); }}>
        <View style={{ flex: 1, paddingBottom: pad, justifyContent: 'flex-end' }}>
          {/* Tapping the dimmed area closes the sheet. It sits behind the panel (not around it), so the
              panel's scroll list never competes with a tappable parent for the finger. */}
          <Pressable testID="sheet-backdrop" style={StyleSheet.absoluteFill} onPress={onClose}
            accessibilityRole="button" accessibilityLabel={`Close ${title}`} />
          <View testID="sheet-panel" style={[{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingBottom: keyboard ? 8 : Math.max(20, insets.bottom + 8) }, sheetHeight({ window: area.now || height, keyboard: pad, topInset: insets.top, tall: !!tall })]}>
            <View style={{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: colors.borderStrong }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
              <Text style={s.sheetTitle}>{title}</Text>
              <PressableOpacity onPress={onDone ?? onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={s.done}>Done</Text>
              </PressableOpacity>
            </View>
            <ScrollView ref={scrollRef} style={tall ? { flex: 1 } : undefined} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator>
              <View ref={contentRef}>{children}</View>
            </ScrollView>
          </View>
        </View>
        {overlay ? <View testID="sheet-overlay" style={StyleSheet.absoluteFill}>{overlay}</View> : null}
      </View>
    </OverlayContext.Provider>
  );
  if (asOverlay) return <View style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]}>{body}</View>;
  return <Modal transparent visible animationType="slide" statusBarTranslucent onRequestClose={() => (overlay ? setOverlay(null) : onClose())}>{body}</Modal>;
}

export { TimeField, EndField, DateField, ChipRow, FieldLabel, AddButton } from './fields';
export { useIssueScroll } from './useIssueScroll';
export { Collapsible } from './Collapsible';
