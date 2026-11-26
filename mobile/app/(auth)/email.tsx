import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSignIn, useSignUp } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { PasswordField } from '@/components/auth/PasswordField';
import { VerificationCodeForm } from '@/components/auth/VerificationCodeForm';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { useAndroidBack } from '@/hooks/useAndroidBack';
import { useCodeAuth } from '@/hooks/useCodeAuth';
import { lookupForPassword } from '@/utils/codeAuth';
import { clerkErrorMessage } from '@/utils/clerkErrors';
import { fontSize } from '@/constants/theme';
import { haptic } from '@/utils/haptics';

type PasswordStep = null | 'existing' | 'new' | 'verify-new' | 'second-factor' | 'no-password';
type SecondFactor = { strategy: 'email_code' | 'phone_code' | 'totp' | 'backup_code'; destination: string };

/**
 * Email sign-in and sign-up on one screen. People choose a one-time code or a password; whether
 * the account is new is worked out for them. Finishing hands over to the root layout's routing.
 */
export default function EmailScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const code = useCodeAuth('email');

  // Prefilled when reset-password sends someone back here to sign in with their new password.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwStep, setPwStep] = useState<PasswordStep>(null);
  const [secondFactor, setSecondFactor] = useState<SecondFactor | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  const trimmed = email.trim();
  const isLoading = busy || code.isLoading;

  const backToEmail = () => { setPwStep(null); setSecondFactor(null); setPassword(''); setConfirm(''); };
  // Android back matches the on-screen arrow: one step at a time, keeping what was typed.
  const stepBack = () => {
    if (pwStep === 'second-factor') setPwStep('existing');
    else if (pwStep === 'verify-new') setPwStep('new');
    else backToEmail();
  };
  useAndroidBack(pwStep !== null, stepBack);

  const alertError = (title: string, err: any, fallback: string) => {
    haptic.error();
    Alert.alert(title, clerkErrorMessage(err, fallback));
  };

  const needsEmail = () => {
    if (trimmed.includes('@')) return false;
    haptic.error();
    Alert.alert('Email needed', 'Please enter your email address.');
    return true;
  };

  const onContinueWithCode = async () => {
    if (isLoading || needsEmail()) return;
    if (await code.start(trimmed)) setPwStep(null);
  };

  const onContinueWithPassword = async () => {
    if (needsEmail() || isLoading) return;
    setBusy(true);
    try {
      const r = await lookupForPassword(trimmed, signIn);
      if (typeof r === 'object') { haptic.error(); Alert.alert("Couldn't continue", r.message); return; }
      setPwStep(r);
    } finally {
      setBusy(false);
    }
  };

  // --- Existing account with a password (moved from the old sign-in screen) ---
  const finishSignIn = async () => {
    if (signIn.status !== 'complete') return false;
    await signIn.finalize();
    return true;
  };

  // The password was right but Clerk wants one more proof (a code). Send it and switch to the code step.
  const startSecondFactor = async () => {
    const factors: any[] = (signIn as any).supportedSecondFactors ?? [];
    const pick = (strategy: string) => factors.find((f) => f.strategy === strategy);
    if (pick('email_code')) {
      const { error } = await signIn.mfa.sendEmailCode();
      if (error) throw error;
      setSecondFactor({ strategy: 'email_code', destination: pick('email_code').safeIdentifier || trimmed });
    } else if (pick('phone_code')) {
      const { error } = await signIn.mfa.sendPhoneCode();
      if (error) throw error;
      setSecondFactor({ strategy: 'phone_code', destination: pick('phone_code').safeIdentifier || 'your phone' });
    } else if (pick('totp')) {
      setSecondFactor({ strategy: 'totp', destination: 'your authenticator app' });
    } else if (pick('backup_code')) {
      setSecondFactor({ strategy: 'backup_code', destination: 'your backup codes' });
    } else {
      // Client-trust checks (new device) fall back to an email code.
      const { error } = await signIn.mfa.sendEmailCode();
      if (error) throw error;
      setSecondFactor({ strategy: 'email_code', destination: trimmed });
    }
    setPwStep('second-factor');
  };

  const onSignIn = async () => {
    if (!password || isLoading) return;
    setBusy(true);
    try {
      const { error } = await signIn.create({ identifier: trimmed, password });
      if (error) { alertError("Couldn't sign in", error, 'Check your password and try again.'); return; }
      if (await finishSignIn()) return;
      if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
        await startSecondFactor();
      } else {
        Alert.alert('One more step', "We couldn't finish signing you in. Please try again or use a code instead.");
      }
    } catch (err) {
      alertError("Couldn't sign in", err, 'An error occurred during sign in.');
    } finally {
      setBusy(false);
    }
  };

  const onVerifySecondFactor = async (value: string) => {
    if (!secondFactor) return;
    setBusy(true);
    try {
      const verify = {
        email_code: () => signIn.mfa.verifyEmailCode({ code: value }),
        phone_code: () => signIn.mfa.verifyPhoneCode({ code: value }),
        totp: () => signIn.mfa.verifyTOTP({ code: value }),
        backup_code: () => signIn.mfa.verifyBackupCode({ code: value }),
      }[secondFactor.strategy];
      const { error } = await verify();
      if (error) { alertError("That code didn't work", error, 'Check the code and try again.'); return; }
      if (!(await finishSignIn())) Alert.alert('One more step', "We couldn't finish signing you in. Please try again.");
    } catch (err) {
      alertError("That code didn't work", err, 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const onResendSecondFactor = async () => {
    if (!secondFactor) return;
    const { error } = secondFactor.strategy === 'phone_code' ? await signIn.mfa.sendPhoneCode() : await signIn.mfa.sendEmailCode();
    if (error) alertError("Couldn't resend", error, "We couldn't resend the code.");
    return !error;
  };

  // --- New account with a password (moved from the old sign-up screen) ---
  const onCreateAccount = async () => {
    if (isLoading) return;
    if (!password) { haptic.error(); Alert.alert('Password needed', 'Please choose a password.'); return; }
    if (password !== confirm) { haptic.error(); Alert.alert("Passwords don't match", 'Please type the same password twice.'); return; }
    setBusy(true);
    try {
      const { error } = await signUp.create({ emailAddress: trimmed, password });
      if (error) { alertError("Couldn't create your account", error, 'An error occurred during sign up.'); return; }
      if (signUp.status === 'complete') { await signUp.finalize(); return; }
      if (signUp.unverifiedFields?.includes('email_address')) {
        // Clerk needs the email confirmed before the account exists: send the code and ask for it.
        const { error: sendError } = await signUp.verifications.sendEmailCode();
        if (sendError) { alertError("Couldn't send the code", sendError, "We couldn't send the verification code."); return; }
        setPwStep('verify-new');
      } else {
        Alert.alert('One more step', "We couldn't finish creating your account. Please try again or use a code instead.");
      }
    } catch (err) {
      alertError("Couldn't create your account", err, 'An error occurred during sign up.');
    } finally {
      setBusy(false);
    }
  };

  const onVerifyNew = async (value: string) => {
    setBusy(true);
    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code: value });
      if (error) { alertError("That code didn't work", error, 'Check the code and try again.'); return; }
      if (signUp.status === 'complete') await signUp.finalize();
      else Alert.alert('One more step', "We couldn't finish creating your account. Please try again.");
    } catch (err) {
      alertError("That code didn't work", err, 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const onResendNew = async () => {
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) alertError("Couldn't resend", error, "We couldn't resend the code.");
    return !error;
  };

  const textLink = (label: string, onPress: () => void, muted = false) => (
    <PressableOpacity onPress={onPress} hitSlop={8} disabled={isLoading}>
      <Text style={[styles.link, { color: muted ? colors.textMuted : colors.brand }]}>{label}</Text>
    </PressableOpacity>
  );

  // --- Screens ---
  if (code.step === 'code') {
    return (
      <AuthScreen title="Check your email" onBack={code.back}>
        <VerificationCodeForm
          destination={code.destination}
          onSubmit={code.verify}
          onResend={code.resend}
          isLoading={code.isLoading}
          onBack={code.back}
          showHeading={false}
        />
      </AuthScreen>
    );
  }

  if (pwStep === 'second-factor' && secondFactor) {
    return (
      <AuthScreen title="One more step" onBack={() => setPwStep('existing')}>
        <VerificationCodeForm
          destination={secondFactor.destination}
          onSubmit={onVerifySecondFactor}
          onResend={onResendSecondFactor}
          hideResend={secondFactor.strategy === 'totp' || secondFactor.strategy === 'backup_code'}
          isLoading={busy}
          showHeading={false}
        />
      </AuthScreen>
    );
  }

  if (pwStep === 'verify-new') {
    return (
      <AuthScreen title="Confirm your email" onBack={() => setPwStep('new')}>
        <VerificationCodeForm destination={trimmed} onSubmit={onVerifyNew} onResend={onResendNew} isLoading={busy} showHeading={false} />
      </AuthScreen>
    );
  }

  if (pwStep === 'existing') {
    return (
      <AuthScreen title="Welcome back" subtitle={trimmed} onBack={backToEmail}>
        <PasswordField
          ref={passwordRef}
          autoFocus
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          accessibilityLabel="Password"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSignIn}
          containerStyle={styles.field}
        />
        <View style={styles.rightLink}>
          {textLink('Forgot password?', () => router.push({ pathname: '/(auth)/forgot-password', params: { email: trimmed } }), true)}
        </View>
        <Button title="Sign in" size="lg" onPress={onSignIn} loading={busy} disabled={!password} />
        <View style={styles.centerLink}>{textLink('Email me a code instead', onContinueWithCode)}</View>
      </AuthScreen>
    );
  }

  if (pwStep === 'new') {
    return (
      <AuthScreen title="Create a password" subtitle={`For your new account, ${trimmed}`} onBack={backToEmail}>
        <PasswordField
          ref={passwordRef}
          autoFocus
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          accessibilityLabel="Password"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          containerStyle={styles.field}
        />
        <PasswordField
          ref={confirmRef}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm password"
          accessibilityLabel="Confirm password"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onCreateAccount}
          containerStyle={styles.fieldLast}
        />
        <Button title="Create account" size="lg" onPress={onCreateAccount} loading={busy} disabled={!password || !confirm} />
        <View style={styles.centerLink}>{textLink('Use a code instead', onContinueWithCode)}</View>
      </AuthScreen>
    );
  }

  if (pwStep === 'no-password') {
    return (
      <AuthScreen title="Use a code instead" onBack={backToEmail}>
        <View style={[styles.note, { backgroundColor: colors.brandSoft }]}>
          <Feather name="info" size={18} color={colors.brand} style={styles.noteIcon} />
          <Text style={[styles.noteText, { color: colors.textSecondary }]}>
            {trimmed} doesn't have a password. We'll email you a code to sign in instead.
          </Text>
        </View>
        <Button title="Email me a code" size="lg" onPress={onContinueWithCode} loading={code.isLoading} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Continue with email"
      subtitle="Sign in or create an account. We'll work out which."
      onBack={() => router.back()}
    >
      <TextField
        autoFocus
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        accessibilityLabel="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="go"
        onSubmitEditing={onContinueWithCode}
        containerStyle={styles.fieldLast}
      />
      <Button
        title="Continue with code"
        size="lg"
        onPress={onContinueWithCode}
        loading={code.isLoading}
        disabled={busy}
        icon={<Feather name="mail" size={18} color="#FFFFFF" />}
      />
      <Button
        title="Continue with password"
        size="lg"
        variant="outline"
        onPress={onContinueWithPassword}
        loading={busy}
        disabled={code.isLoading}
        icon={<Feather name="lock" size={18} color={colors.textPrimary} />}
        style={styles.secondButton}
      />
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        A code signs you in without a password. We'll email you a 6-digit code.
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 12 },
  fieldLast: { marginBottom: 20 },
  secondButton: { marginTop: 12 },
  hint: { fontSize: fontSize.sm, lineHeight: 18, textAlign: 'center', marginTop: 18 },
  link: { fontSize: fontSize.base, fontWeight: '600' },
  rightLink: { alignSelf: 'flex-end', marginBottom: 20 },
  centerLink: { alignItems: 'center', marginTop: 20 },
  note: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 14, padding: 14, marginBottom: 20 },
  noteIcon: { marginRight: 10, marginTop: 1 },
  noteText: { flex: 1, fontSize: fontSize.base, lineHeight: 21 },
});
