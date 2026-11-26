import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';

export type SquircleTint = { bg: string; border: string; fg: string };

type Props = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  subtitle?: string;
  tint: SquircleTint;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

// A square tile, filled and outlined in its tint colour, with continuous corners: a true squircle on iOS, a plain rounded square on
// Android (borderCurve is iOS-only). Used for the Group Details grid.
export function SquircleTile({ icon, label, subtitle, tint, onPress, style, testID }: Props) {
  const colors = useThemeColors();
  return (
    <PressableOpacity
      testID={testID}
      accessibilityLabel={subtitle ? `${label}, ${subtitle}` : label}
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.tile, { backgroundColor: tint.bg, borderColor: tint.border }, style]}
    >
      <Feather name={icon} size={40} color={tint.fg} />
      <View>
        <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={2}>{label}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </PressableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    aspectRatio: 1,
    borderRadius: 28,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 16,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 13, fontWeight: '600', marginTop: 2 },
});
