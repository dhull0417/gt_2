import React from 'react';
import { Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

/**
 * Takes the place of a form's Create/Save/Review button when the draft uses Premium features the
 * group doesn't have yet. The owner can open the paywall; anyone else is told the owner needs Premium.
 * Pass the form's own primary-button style so it sits in the footer like the button it replaces.
 */
export function PremiumSubmitButton({ mode, style }: { mode: 'upgrade' | 'ownerNeeds'; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const label = mode === 'upgrade' ? 'Premium' : 'Owner needs Premium';
  return (
    <PressableOpacity
      style={[style, mode === 'ownerNeeds' && styles.disabled]}
      onPress={mode === 'upgrade' ? () => router.push('/paywall') : undefined}
      disabled={mode === 'ownerNeeds'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: mode === 'ownerNeeds' }}
    >
      {mode === 'upgrade' && <Feather name="star" size={16} color="#fff" style={{ marginRight: 6 }} />}
      <Text style={styles.text}>{label}</Text>
    </PressableOpacity>
  );
}

const styles = StyleSheet.create({
  text: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
