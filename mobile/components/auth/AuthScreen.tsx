import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { fontSize } from '@/constants/theme';

interface Props {
  title?: string;
  subtitle?: string;
  /** Shows the back chevron when set. */
  onBack?: () => void;
  children: React.ReactNode;
  /** Pinned under the scrolling content (e.g. "Don't have an account?" links). */
  footer?: React.ReactNode;
}

/** The shared frame for every sign-in screen: back button, big title, keyboard-safe scrolling body. */
export function AuthScreen({ title, subtitle, onBack, children, footer }: Props) {
  const colors = useThemeColors();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.header}>
          {onBack ? (
            <PressableOpacity onPress={onBack} accessibilityLabel="Go back" hitSlop={12} style={styles.backBtn}>
              <Feather name="chevron-left" size={28} color={colors.brand} />
            </PressableOpacity>
          ) : <View style={styles.backBtn} />}
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {title ? <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">{title}</Text> : null}
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
          <View style={title || subtitle ? styles.content : undefined}>{children}</View>
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 4, height: 48 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.3 },
  subtitle: { fontSize: fontSize.base, lineHeight: 21, marginTop: 6 },
  content: { marginTop: 24 },
  footer: { paddingHorizontal: 24, paddingBottom: 16, alignItems: 'center' },
});
