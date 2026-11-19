import React, { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { TextField, type TextFieldProps } from '@/components/ui/TextField';
import { useThemeColors } from '@/contexts/AppearanceContext';

/** TextField for passwords, with a show/hide toggle. `accessibilityLabel` names it for screen readers and tests. */
export const PasswordField = forwardRef<TextInput, TextFieldProps>(function PasswordField({ containerStyle, style, ...rest }, ref) {
  const colors = useThemeColors();
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.wrap, containerStyle]}>
      <TextField
        ref={ref}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, style]}
        {...rest}
      />
      <PressableOpacity
        onPress={() => setVisible((v) => !v)}
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        hitSlop={8}
        style={styles.eye}
      >
        <Feather name={visible ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
      </PressableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'relative', justifyContent: 'center' },
  input: { paddingRight: 48 },
  eye: { position: 'absolute', right: 14, bottom: 14 },
});
