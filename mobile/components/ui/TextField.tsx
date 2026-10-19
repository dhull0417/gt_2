import React, { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { fontSize, fontWeight, radius } from '@/constants/theme';

export type TextFieldProps = TextInputProps & {
  label?: string;
  /** Error text shown under the field; also turns the border red. */
  error?: string | null;
  helperText?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

/** Themed text input with optional label, helper text and error state. Forwards its ref to the TextInput. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, helperText, containerStyle, style, accessibilityLabel, ...rest },
  ref
) {
  const colors = useThemeColors();
  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={accessibilityLabel ?? label}
        style={[
          styles.input,
          {
            backgroundColor: colors.surfaceAlt,
            borderColor: error ? colors.danger : colors.border,
            color: colors.textPrimary,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[styles.help, { color: colors.danger }]}>{error}</Text>
      ) : helperText ? (
        <Text style={[styles.help, { color: colors.textMuted }]}>{helperText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.lg,
  },
  help: { fontSize: fontSize.xs, marginTop: 6 },
});
