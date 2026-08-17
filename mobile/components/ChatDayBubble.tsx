import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

interface Props {
  label: string;
}

export function ChatDayBubble({ label }: Props) {
  const entrance = useSharedValue(0);
  const press = useSharedValue(1);

  useEffect(() => {
    entrance.value = withTiming(1, { duration: 260 });
  }, [entrance]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * -6 },
      { scale: (0.88 + entrance.value * 0.12) * press.value },
    ],
  }));

  const handlePressIn = () => {
    press.value = withSpring(0.94, { damping: 14, stiffness: 300 });
  };
  const handlePressOut = () => {
    press.value = withSpring(1, { damping: 14, stiffness: 300 });
  };
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut} hitSlop={6}>
        <Animated.View style={[styles.shadowWrap, animatedStyle]}>
          <BlurView intensity={50} tint="light" style={styles.pill}>
            <View style={styles.tint} />
            <Text style={styles.label}>{label}</Text>
          </BlurView>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8 },
  shadowWrap: {
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.3,
  },
});
