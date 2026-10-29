import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { EmojiKeyboard, type EmojiType } from 'rn-emoji-keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance, useThemeColors } from '@/contexts/AppearanceContext';

/**
 * Bottom-sheet emoji picker (with search) used for chat reactions and the
 * custom RSVP reaction composer.
 *
 * Why this replaces `rn-emoji-keyboard`'s default `<EmojiPicker>` modal:
 * that modal sizes its sheet as `defaultHeight + keyboardHeight` as soon as the
 * keyboard opens (i.e. when the user taps the search field) and pins it to the
 * bottom of the screen. The sheet ends up taller than the room it actually has,
 * and whatever doesn't fit overflows off the *top* — the search bar / first rows
 * of emoji become unreachable. It also only learns about the keyboard from
 * iOS-only events.
 *
 * Here we keep the library's inline `<EmojiKeyboard>` but own the sheet. The
 * sheet is a flex child that is allowed to shrink (`flexShrink: 1`) inside a
 * container that is pushed up by the keyboard, so its height is always
 * `min(preferred height, space actually available)` and can never overflow.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  onEmojiSelected: (emoji: EmojiType) => void;
  /** Share of the screen height the sheet takes when there is room for it. */
  heightRatio?: number;
};

const TOP_GAP = 8;
const SHEET_RADIUS = 16;

type EmojiKeyboardTheme = React.ComponentProps<typeof EmojiKeyboard>['theme'];

const LIGHT_SHEET_BACKGROUND = '#ffffff'; // matches rn-emoji-keyboard's default theme.container
const DARK_SHEET_BACKGROUND = '#000000';

// Overrides for rn-emoji-keyboard's built-in (light) theme. Module-level so the object
// identity is stable across renders. Light mode passes no theme and keeps the defaults.
const DARK_EMOJI_THEME: EmojiKeyboardTheme = {
  container: DARK_SHEET_BACKGROUND,
  header: 'rgba(255,255,255,0.6)',
  skinTonesContainer: '#1C1F26',
  category: {
    icon: '#9CA3AF',
    iconActive: '#5B9EE8',
    container: '#1C1F26',
    containerActive: '#2C313A',
  },
  search: {
    background: '#1C1F26',
    text: '#F3F4F6',
    placeholder: '#6B7280',
    icon: '#9CA3AF',
  },
  emoji: { selected: '#2C313A' },
};
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 0.8;

/** Whether the software keyboard is currently up (only tracked while `active`). */
function useKeyboardVisible(active: boolean) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [active]);

  return visible;
}

export function EmojiPickerSheet({ open, onClose, onEmojiSelected, heightRatio = 0.75 }: Props) {
  const colors = useThemeColors();
  const { scheme } = useAppearance();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible(open);

  const slideY = useRef(new Animated.Value(windowHeight)).current; // open/close slide
  const dragY = useRef(new Animated.Value(0)).current; // finger drag on the handle

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    dragY.setValue(0);
    if (open) {
      Animated.spring(slideY, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
    } else {
      slideY.setValue(windowHeight);
    }
  }, [open, slideY, dragY, windowHeight]);

  // Drag the handle down to dismiss (mirrors the library's old knob behavior).
  const handlePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          onCloseRef.current();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const handleSelect = (emoji: EmojiType) => {
    onEmojiSelected(emoji);
    onClose();
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* Pads the bottom by the keyboard's height so the sheet rides on top of it. Needed on Android
          too: an edge-to-edge Modal window is not resized for the keyboard, so the search results
          were hidden under it. */}
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.root, { paddingTop: insets.top + TOP_GAP }]}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close emoji picker"
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              height: Math.round(windowHeight * heightRatio),
              backgroundColor: isDark ? DARK_SHEET_BACKGROUND : LIGHT_SHEET_BACKGROUND,
              // Pure black on the dimmed backdrop needs an edge to read as a sheet.
              ...(isDark && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong }),
              // Home-indicator room only while the keyboard isn't covering it.
              paddingBottom: keyboardVisible ? 0 : insets.bottom,
              transform: [{ translateY: Animated.add(slideY, dragY) }],
            },
          ]}
        >
          <View style={styles.handleHit} {...handlePan.panHandlers}>
            <View style={[styles.handle, isDark && styles.handleDark]} />
          </View>
          <View style={styles.keyboardWrap}>
            <EmojiKeyboard
              onEmojiSelected={handleSelect}
              enableSearchBar
              enableRecentlyUsed
              theme={isDark ? DARK_EMOJI_THEME : undefined}
              // We handle insets ourselves (the library's SafeAreaView misreads them once the sheet is pushed around).
              disableSafeArea
              defaultHeight={`${Math.round(heightRatio * 100)}%`}
            />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    // RN defaults to flexShrink: 0. Shrinking is the whole point: when the keyboard
    // (or a short screen) leaves less room than `height`, the sheet gives way
    // instead of overflowing off the top of the screen.
    flexShrink: 1,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    overflow: 'hidden',
  },
  handleHit: { alignItems: 'center', paddingTop: 8, paddingBottom: 6 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D1D5DB' },
  handleDark: { backgroundColor: '#3A4048' },
  keyboardWrap: { flex: 1 },
});
