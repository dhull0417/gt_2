import React, { useEffect } from 'react';
import { View, StyleSheet, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { LoadingAnimation } from '@/components/LoadingAnimation';

/** A softly pulsing placeholder block that matches the card colors in light and dark. */
export function Skeleton({ width = '100%', height = 14, radius = 8, style }: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + pulse.value * 0.45 }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.backgroundAlt }, animated, style]}
    />
  );
}

const CardShell = ({ children }: { children: React.ReactNode }) => {
  const colors = useThemeColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>
  );
};

export function MeetupCardSkeleton() {
  return (
    <CardShell>
      <View style={styles.row}>
        <Skeleton width={44} height={44} radius={12} />
        <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
      <Skeleton width="85%" height={12} style={{ marginTop: 16 }} />
      <View style={[styles.row, { marginTop: 16, gap: 10 }]}>
        <Skeleton width="48%" height={40} radius={12} />
        <Skeleton width="48%" height={40} radius={12} />
      </View>
    </CardShell>
  );
}

export function GroupRowSkeleton() {
  return (
    <CardShell>
      <View style={styles.row}>
        <Skeleton width={44} height={44} radius={12} />
        <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
          <Skeleton width="50%" height={16} />
          <Skeleton width="75%" height={12} />
        </View>
      </View>
    </CardShell>
  );
}

export function NotificationRowSkeleton() {
  return (
    <View style={[styles.row, { paddingHorizontal: 16, paddingVertical: 14 }]}>
      <Skeleton width={28} height={28} radius={14} />
      <View style={{ flex: 1, marginLeft: 16, gap: 8 }}>
        <Skeleton width="90%" height={14} />
        <Skeleton width="30%" height={10} />
      </View>
    </View>
  );
}

/**
 * Placeholder rows for a screen that's loading, with the app's Lottie logo floating on top,
 * so the layout is already in place when the real content arrives.
 */
export function SkeletonList({ kind, count = 4 }: { kind: 'meetup' | 'group' | 'notification'; count?: number }) {
  const Row = kind === 'meetup' ? MeetupCardSkeleton : kind === 'group' ? GroupRowSkeleton : NotificationRowSkeleton;
  return (
    <View style={{ flex: 1 }}>
      {Array.from({ length: count }).map((_, i) => <Row key={i} />)}
      <View style={styles.overlay} pointerEvents="none">
        <LoadingAnimation size={96} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 72 },
});
