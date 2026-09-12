import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

interface Props {
  label: string;
}

function Dot({ delay }: { delay: number }) {
  const bounce = useSharedValue(0);

  useEffect(() => {
    bounce.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })), -1)
    );
  }, [bounce, delay]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -bounce.value * 4 }],
    opacity: 0.5 + bounce.value * 0.5,
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

// WhatsApp/iMessage-style bubble with three bouncing dots, replacing a plain "X is typing…" line.
export function ChatTypingBubble({ label }: Props) {
  const entrance = useSharedValue(0);

  useEffect(() => {
    entrance.value = withTiming(1, { duration: 200 });
  }, [entrance]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ scale: 0.9 + entrance.value * 0.1 }],
  }));

  return (
    <Animated.View style={[styles.row, entranceStyle]}>
      <View style={styles.bubble}>
        <Dot delay={0} />
        <Dot delay={120} />
        <Dot delay={240} />
      </View>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 4, gap: 8 },
  label: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', flexShrink: 1 },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9CA3AF',
  },
});
