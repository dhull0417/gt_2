import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { radius, spacing } from '@/constants/theme';

export type CardProps = ViewProps & {
  /** Inner padding (default true). */
  padded?: boolean;
};

/** Themed surface: card background, hairline border, rounded corners. */
export function Card({ padded = true, style, ...rest }: CardProps) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        padded && { padding: spacing.lg },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg },
});
