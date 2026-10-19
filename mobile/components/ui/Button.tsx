import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { fontSize, fontWeight, radius } from '@/constants/theme';
import { PressableScale } from './PressableScale';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Rendered to the left of the title (e.g. a Feather icon). */
  icon?: React.ReactNode;
  /** Stretch to the parent's width (default true). */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const SIZES: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { paddingVertical: 8, paddingHorizontal: 14, fontSize: fontSize.md },
  md: { paddingVertical: 12, paddingHorizontal: 18, fontSize: fontSize.base },
  lg: { paddingVertical: 14, paddingHorizontal: 22, fontSize: fontSize.lg },
};

/** Themed button. Colors come from the theme tokens, so it follows light/dark automatically. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const colors = useThemeColors();

  const palette = {
    primary: { bg: colors.brand, fg: '#FFFFFF', border: colors.brand },
    secondary: { bg: colors.brandSoft, fg: colors.brand, border: colors.brandSoft },
    outline: { bg: 'transparent', fg: colors.textPrimary, border: colors.borderStrong },
    danger: { bg: colors.danger, fg: '#FFFFFF', border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.brand, border: 'transparent' },
  }[variant];

  const sz = SIZES[size];
  const inactive = disabled || loading;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          paddingVertical: sz.paddingVertical,
          paddingHorizontal: sz.paddingHorizontal,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text style={{ color: palette.fg, fontSize: sz.fontSize, fontWeight: fontWeight.bold }}>{title}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  icon: { marginRight: 8 },
});
