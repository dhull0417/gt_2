// Custom bottom tab bar used on Android only. expo-router's NativeTabs renders
// the real Android Material 3 NavigationBar, which draws a solid pill/oval behind
// the selected icon and has no hook for custom per-icon animation. This JS tab bar
// replaces that on Android so the selected icon can just tint blue, grow slightly,
// and breathe — iOS keeps the native SF Symbols tab bar in app/(tabs)/_layout.tsx.
import React, { useEffect } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
const ACTIVE_COLOR = '#4A90E2';
const INACTIVE_COLOR = '#8E8E93';

// Matches TAB_BAR_HEIGHT in utils/layout.ts (android: 80), which screens use to
// pad their bottom content — keep this in sync so nothing shifts under the bar.
const BAR_HEIGHT = 80;

const SHADOW_WIDTH = 30;
const SHADOW_HEIGHT = 9;

const TAB_ICONS: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  index: 'home',
  groups: 'users',
  profile: 'user',
};

const AnimatedTabIcon = ({ name, focused }: { name: React.ComponentProps<typeof Feather>['name']; focused: boolean }) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const shadowOpacity = useSharedValue(0);

  useEffect(() => {
    if (focused) {
      scale.value = withTiming(1.3, { duration: 200 });
      shadowOpacity.value = withTiming(1, { duration: 200 });
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1, { duration: 200 });
      shadowOpacity.value = withTiming(0, { duration: 200 });
      opacity.value = withTiming(1, { duration: 200 });
    }
  }, [focused]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    opacity: shadowOpacity.value * 0.35,
  }));

  return (
    <View style={styles.iconWrap}>
      <Animated.View style={[styles.shadow, shadowStyle]}>
        <Svg width={SHADOW_WIDTH} height={SHADOW_HEIGHT}>
          <Defs>
            {/* Darkest at the center, fading out toward the tapered tips. */}
            <RadialGradient id="tabShadowGradient" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={ACTIVE_COLOR} stopOpacity={0.6} />
              <Stop offset="100%" stopColor={ACTIVE_COLOR} stopOpacity={0.22} />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx={SHADOW_WIDTH / 2}
            cy={SHADOW_HEIGHT / 2}
            rx={SHADOW_WIDTH / 2}
            ry={SHADOW_HEIGHT / 2}
            fill="url(#tabShadowGradient)"
          />
        </Svg>
      </Animated.View>
      <Animated.View style={iconStyle}>
        <Feather name={name} size={24} color={focused ? ACTIVE_COLOR : INACTIVE_COLOR} />
      </Animated.View>
    </View>
  );
};

export const AndroidTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { height: BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (event.defaultPrevented) return;

          if (!isFocused) {
            navigation.navigate(route.name, route.params);
            return;
          }

          // Already on this tab. The Groups tab hosts its own nested stack (list
          // -> group details), and React Navigation's default "tabPress on an
          // already-focused tab pops its nested stack" reset only fires when that
          // stack already has the list screen sitting underneath the current one.
          // Group Details can also be reached by pushing in from the chat screen's
          // header, entirely outside this tab, which leaves it as the stack's only
          // entry — so that default reset has nothing to pop to and no-ops. Send
          // the tab back to its list screen explicitly so the tap always works.
          if (route.name === 'groups') {
            navigation.navigate('groups', { screen: 'index' });
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tab}
          >
            <AnimatedTabIcon name={TAB_ICONS[route.name] ?? 'circle'} focused={isFocused} />
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  tab: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    position: 'absolute',
    bottom: -17,
    width: SHADOW_WIDTH,
    height: SHADOW_HEIGHT,
  },
});
