import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';

interface Props {
  visible: boolean;
  meetupName: string;
  onClose: () => void;
  /** reason is trimmed; empty string means "no reason given". */
  onConfirm: (reason: string) => void;
  busy?: boolean;
}

/**
 * Asks for an optional reason before cancelling a meetup. It's an in-tree overlay (not a
 * Modal) because the meetup sheet is itself a Modal, and a nested one can fail to present on iOS.
 */
export function CancelReasonSheet({ visible, meetupName, onClose, onConfirm, busy }: Props) {
  const colors = useThemeColors();
  const [reason, setReason] = useState('');
  useEffect(() => { if (visible) setReason(''); }, [visible]);
  if (!visible) return null;

  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <PressableOpacity activeOpacity={1} haptic={false} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Cancel "{meetupName}"?</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            Everyone will be notified. You can add a short reason that goes in the notification and the group chat.
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Reason (optional)"
            placeholderTextColor={colors.placeholder}
            maxLength={200}
            multiline
            style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          />
          <View style={styles.row}>
            <PressableOpacity style={[styles.btn, { backgroundColor: colors.backgroundAlt }]} onPress={onClose} disabled={busy}>
              <Text style={[styles.btnText, { color: colors.textSecondary }]}>Keep meetup</Text>
            </PressableOpacity>
            <PressableOpacity style={[styles.btn, { backgroundColor: colors.danger, opacity: busy ? 0.6 : 1 }]} onPress={() => onConfirm(reason.trim())} disabled={busy} haptic="press">
              <Text style={[styles.btnText, { color: '#fff' }]}>{busy ? 'Cancelling…' : 'Cancel meetup'}</Text>
            </PressableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 24 },
  card: { borderRadius: 20, borderWidth: 1, padding: 20 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 72, fontSize: 15, textAlignVertical: 'top', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
});
