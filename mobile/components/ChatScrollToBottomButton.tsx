import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface Props {
  visible: boolean;
  unreadCount: number;
  onPress: () => void;
}

export function ChatScrollToBottomButton({ visible, unreadCount, onPress }: Props) {
  const entrance = useSharedValue(0);

  useEffect(() => {
    entrance.value = withSpring(visible ? 1 : 0, { damping: 16, stiffness: 220 });
  }, [visible, entrance]);

  const style = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 24 },
      { scale: 0.7 + entrance.value * 0.3 },
    ],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View style={[styles.wrap, style]} pointerEvents={visible ? 'auto' : 'none'}>
      <Pressable onPress={handlePress} style={styles.button}>
        <Feather name="chevron-down" size={20} color="#4A90E2" />
        {unreadCount > 0 && (
          <Animated.View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 16, bottom: 8, zIndex: 5 },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#EEF2F2',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
