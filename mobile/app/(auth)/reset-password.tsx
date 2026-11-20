import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSignIn } from '@clerk/expo';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { PasswordField } from '@/components/auth/PasswordField';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { clerkErrorMessage } from '@/utils/clerkErrors';
import { haptic } from '@/utils/haptics';
import { fontSize } from '@/constants/theme';

const RESEND_COOLDOWN_S = 30;

const ResetPasswordScreen = () => {
  const router = useRouter();
  const colors = useThemeColors();
  const { signIn } = useSignIn();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fail = (title: string, err: any, fallback: string) => {
    haptic.error();
    Alert.alert(title, clerkErrorMessage(err, fallback));
  };

  const onReset = async () => {
    if (isLoading) return;
    if (code.length < 4) { haptic.error(); Alert.alert('Code needed', 'Enter the code we emailed you.'); return; }
    if (!password) { haptic.error(); Alert.alert('Password needed', 'Please choose a new password.'); return; }
    if (password !== confirmPassword) { haptic.error(); Alert.alert("Passwords don't match", 'Please type the same password twice.'); return; }
    setIsLoading(true);
    try {
      // After a good code Clerk waits for the password (needs_new_password). If that password was
      // rejected, retrying must not verify the now-used code again.
      if (signIn.status !== 'needs_new_password') {
        const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({ code });
        if (verifyError) return fail("That code didn't work", verifyError, 'Check the code and try again.');
      }
      const { error: submitError } = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (submitError) return fail("Couldn't save your password", submitError, 'Please try a different password.');
      if (signIn.status === 'complete') {
        haptic.success();
        await signIn.finalize();
      } else {
        // e.g. the account also has two-step verification: the password is saved, but sign-in needs another step.
        Alert.alert('Password updated', 'Your new password is saved. Please sign in with it.', [
          { text: 'OK', onPress: () => router.dismissTo({ pathname: '/(auth)/email', params: { email } }) },
        ]);
      }
    } catch (err: any) {
      fail("Couldn't reset your password", err, 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const [resending, setResending] = useState(false);
  const onResend = async () => {
    if (resending) return;
    setResending(true);
    try {
      const { error } = await signIn.resetPasswordEmailCode.sendCode();
      if (error) return fail("Couldn't resend", error, "We couldn't resend the code.");
      setCooldown(RESEND_COOLDOWN_S);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthScreen
      title="Choose a new password"
      subtitle={email ? `We emailed a code to ${email}.` : 'We emailed you a code.'}
      onBack={() => router.back()}
    >
      {/* Uncontrolled on purpose, like VerificationCodeForm: echoing state back can undo an iOS paste. */}
      <TextField
        autoFocus
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
        placeholder="Code"
        accessibilityLabel="Verification code"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        style={styles.code}
        containerStyle={styles.field}
      />
      <PasswordField
        ref={passwordRef}
        value={password}
        onChangeText={setPassword}
        placeholder="New password"
        accessibilityLabel="New password"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        containerStyle={styles.field}
      />
      <PasswordField
        ref={confirmRef}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm new password"
        accessibilityLabel="Confirm new password"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={onReset}
        containerStyle={styles.fieldLast}
      />
      <Button title="Save and sign in" size="lg" onPress={onReset} loading={isLoading} />
      <View style={styles.resendRow}>
        <PressableOpacity disabled={cooldown > 0 || resending} onPress={onResend} hitSlop={8}>
          <Text style={[styles.resend, { color: cooldown > 0 ? colors.textFaint : colors.brand }]}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </Text>
        </PressableOpacity>
      </View>
    </AuthScreen>
  );
};

const styles = StyleSheet.create({
  field: { marginBottom: 12 },
  fieldLast: { marginBottom: 20 },
  code: { letterSpacing: 4, fontWeight: '700' },
  resendRow: { alignItems: 'center', marginTop: 18 },
  resend: { fontSize: fontSize.base, fontWeight: '700' },
});

export default ResetPasswordScreen;
