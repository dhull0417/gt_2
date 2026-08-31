import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { subscribeRsvpResponse } from '@/utils/rsvpResponseBus';
import { getRandomRsvpResponse, RsvpResponse } from '@/utils/rsvpResponses';

const AUTO_DISMISS_MS = 2200;

// Absolutely-positioned overlay, not RN <Modal> — a nested Modal can fail to
// present on iOS (e.g. inside MeetupDetailModal).
const RsvpResponseOverlay = () => {
  const [current, setCurrent] = useState<(RsvpResponse & { status: 'in' | 'out' }) | null>(null);

  const backdropOpacity = useSharedValue(0);
  const scale = useSharedValue(0);
  const rotate = useSharedValue(0);
  const emojiBounce = useSharedValue(0);

  useEffect(() => subscribeRsvpResponse((status) => {
    setCurrent({ ...getRandomRsvpResponse(status), status });
  }), []);

  const dismiss = () => {
    backdropOpacity.value = withTiming(0, { duration: 180 });
    scale.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(setCurrent)(null);
    });
  };

  useEffect(() => {
    if (!current) return;

    backdropOpacity.value = withTiming(1, { duration: 150 });
    scale.value = 0;
    rotate.value = withSequence(
      withTiming(-4, { duration: 60 }),
      withTiming(4, { duration: 90 }),
      withTiming(-2, { duration: 90 }),
      withTiming(0, { duration: 80 })
    );
    scale.value = withSpring(1, { damping: 9, stiffness: 160, mass: 0.7 });

    emojiBounce.value = 0;
    emojiBounce.value = withDelay(
      150,
      withRepeat(
        withSequence(
          withTiming(-10, { duration: 260, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) })
        ),
        -1,
        true
      )
    );

    const dismissTimer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(dismissTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.text]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));
  const emojiStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: emojiBounce.value }],
  }));

  if (!current) return null;

  const isIn = current.status === 'in';
  const accentColor = isIn ? '#4FD1C5' : '#FF7A6E';

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <View style={styles.centerWrap} pointerEvents="box-none">
          <Animated.View style={[styles.card, { borderColor: accentColor }, cardStyle]}>
            <Animated.Text style={[styles.emoji, emojiStyle]}>{current.emoji}</Animated.Text>
            <Text style={[styles.responseText, { color: accentColor }]}>{current.text}</Text>
          </Animated.View>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17, 24, 39, 0.45)' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  card: {
    backgroundColor: 'white',
    borderRadius: 28,
    borderWidth: 3,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
    minWidth: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  emoji: { fontSize: 56, marginBottom: 14 },
  responseText: { fontSize: 19, fontWeight: '900', textAlign: 'center', lineHeight: 26 },
});

export default RsvpResponseOverlay;
