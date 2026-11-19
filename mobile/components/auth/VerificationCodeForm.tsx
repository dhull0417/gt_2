import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { fontSize } from '@/constants/theme';

interface Props {
  /** "We sent a code to a***@gmail.com" - say where it went. */
  destination: string;
  onSubmit: (code: string) => Promise<void> | void;
  /** Return false when the resend failed (the handler shows its own error) so the button stays available. */
  onResend?: () => Promise<boolean | void> | boolean | void;
  isLoading?: boolean;
  /** Hide "Resend" (e.g. authenticator app codes). */
  hideResend?: boolean;
  onBack?: () => void;
  /** Off when the surrounding AuthScreen already has a title. */
  showHeading?: boolean;
}

const RESEND_COOLDOWN_S = 30;

/** The one code-entry step used by every sign-in path, with guidance, autofill and a resend timer. */
export function VerificationCodeForm({ destination, onSubmit, onResend, isLoading, hideResend, onBack, showHeading = true }: Props) {
  const colors = useThemeColors();
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const isEmail = destination.includes('@');

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const ready = code.length >= 4;
  const submit = () => { if (ready && !isLoading) onSubmit(code); };

  return (
    <View>
      {showHeading ? (
        <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
          Check your {isEmail ? 'email' : 'messages'}
        </Text>
      ) : null}
      <Text style={[styles.body, { color: colors.textMuted }]}>
        We sent a code to <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{destination}</Text>.
        {isEmail ? " It can take a minute to arrive. Check your spam folder if you don't see it." : ''}
      </Text>
      <TextField
        ref={inputRef}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
        placeholder="••••••"
        accessibilityLabel="Verification code"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="done"
        onSubmitEditing={submit}
        style={styles.codeInput}
        containerStyle={styles.field}
      />
      <Button title="Verify" size="lg" onPress={submit} loading={isLoading} disabled={!ready} />
      <View style={styles.row}>
        {onBack ? (
          <PressableOpacity onPress={onBack} hitSlop={8}>
            <Text style={[styles.link, { color: colors.textMuted }]}>{isEmail ? 'Use a different email' : 'Use a different number'}</Text>
          </PressableOpacity>
        ) : <View />}
        {!hideResend && onResend ? (
          <PressableOpacity
            disabled={cooldown > 0 || resending}
            hitSlop={8}
            onPress={async () => {
              setResending(true);
              try {
                if ((await onResend()) !== false) setCooldown(RESEND_COOLDOWN_S);
              } finally {
                setResending(false);
              }
            }}
          >
            <Text style={[styles.link, { color: cooldown > 0 ? colors.textFaint : colors.brand, fontWeight: '700' }]}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </Text>
          </PressableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.3, marginBottom: 6 },
  body: { fontSize: fontSize.base, lineHeight: 21, marginBottom: 20 },
  field: { marginBottom: 16 },
  codeInput: { textAlign: 'center', fontSize: 24, fontWeight: '700', letterSpacing: 6, height: 56, paddingVertical: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  link: { fontSize: fontSize.base },
});
