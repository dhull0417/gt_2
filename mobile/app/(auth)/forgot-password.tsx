import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSignIn } from '@clerk/expo';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { clerkErrorMessage } from '@/utils/clerkErrors';
import { haptic } from '@/utils/haptics';

const ForgotPasswordScreen = () => {
  const router = useRouter();
  const { signIn } = useSignIn();
  // Filled in from the email screen's "Forgot password?" link.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [isLoading, setIsLoading] = useState(false);

  const fail = (err: any) => {
    haptic.error();
    Alert.alert("Couldn't send the code", clerkErrorMessage(err, 'An error occurred.'));
  };

  const onRequestReset = async () => {
    if (isLoading) return;
    const identifier = email.trim();
    if (!identifier.includes('@')) { haptic.error(); Alert.alert('Email needed', 'Please enter your email address.'); return; }
    setIsLoading(true);
    try {
      const { error: createError } = await signIn.create({ identifier });
      if (createError) return fail(createError);
      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) return fail(sendError);
      router.push({ pathname: '/(auth)/reset-password', params: { email: identifier } });
    } catch (err: any) {
      fail(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthScreen
      title="Reset your password"
      subtitle="We'll email you a code so you can choose a new one."
      onBack={() => router.back()}
    >
      <TextField
        autoFocus={!email}
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
        onSubmitEditing={onRequestReset}
        containerStyle={styles.field}
      />
      <Button title="Send reset code" size="lg" onPress={onRequestReset} loading={isLoading} />
    </AuthScreen>
  );
};

const styles = StyleSheet.create({ field: { marginBottom: 20 } });

export default ForgotPasswordScreen;
