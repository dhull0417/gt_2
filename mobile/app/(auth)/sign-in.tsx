import { View, Text, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useRef, useState } from 'react';
import { useSignIn } from '@clerk/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { VerificationCodeForm } from '@/components/auth/VerificationCodeForm';
import { clerkErrorMessage } from '@/utils/clerkErrors';
import { haptic } from '@/utils/haptics';

const SignInScreen = () => {
  const router = useRouter();
  const { signIn } = useSignIn();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  // Set when Clerk asks for a second step (email/SMS code or authenticator app) after the password.
  const [secondFactor, setSecondFactor] = useState<null | { strategy: 'email_code' | 'phone_code' | 'totp' | 'backup_code'; destination: string }>(null);
  const passwordRef = useRef<TextInput>(null);

  const finishIfComplete = async (): Promise<boolean> => {
    if (signIn.status === 'complete') {
      await signIn.finalize();
      return true;
    }
    return false;
  };

  // The password was right but Clerk wants one more proof (a code). Send it and switch to the code step.
  const startSecondFactor = async () => {
    const factors: any[] = (signIn as any).supportedSecondFactors ?? [];
    const pick = (strategy: string) => factors.find((f) => f.strategy === strategy);
    if (pick('email_code')) {
      const { error } = await signIn.mfa.sendEmailCode();
      if (error) throw error;
      setSecondFactor({ strategy: 'email_code', destination: pick('email_code').safeIdentifier || email.trim() });
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
      setSecondFactor({ strategy: 'email_code', destination: email.trim() });
    }
  };

  const onSignInPress = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing Information', 'Please enter your email and password.');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await signIn.create({ identifier: email.trim(), password });
      if (error) {
        haptic.error();
        Alert.alert('Error', clerkErrorMessage(error, 'An error occurred during sign in.'));
        return;
      }
      if (await finishIfComplete()) return;
      if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
        await startSecondFactor();
      } else {
        Alert.alert('One more step', `We couldn't finish signing you in (${signIn.status}). Please try again or use another sign-in option.`);
      }
    } catch (err: any) {
      haptic.error();
      Alert.alert('Error', clerkErrorMessage(err, 'An error occurred during sign in.'));
    } finally {
      setIsLoading(false);
    }
  };

  const onVerifyCode = async (code: string) => {
    if (!secondFactor) return;
    setIsLoading(true);
    try {
      const verify = {
        email_code: () => signIn.mfa.verifyEmailCode({ code }),
        phone_code: () => signIn.mfa.verifyPhoneCode({ code }),
        totp: () => signIn.mfa.verifyTOTP({ code }),
        backup_code: () => signIn.mfa.verifyBackupCode({ code }),
      }[secondFactor.strategy];
      const { error } = await verify();
      if (error) {
        haptic.error();
        Alert.alert("That code didn't work", clerkErrorMessage(error, 'Check the code and try again.'));
        return;
      }
      if (!(await finishIfComplete())) {
        Alert.alert('One more step', `We couldn't finish signing you in (${signIn.status}).`);
      }
    } catch (err: any) {
      haptic.error();
      Alert.alert('Error', clerkErrorMessage(err, 'Verification failed.'));
    } finally {
      setIsLoading(false);
    }
  };

  const onResendCode = async () => {
    if (!secondFactor) return;
    const { error } = secondFactor.strategy === 'phone_code' ? await signIn.mfa.sendPhoneCode() : await signIn.mfa.sendEmailCode();
    if (error) Alert.alert('Error', clerkErrorMessage(error, "We couldn't resend the code."));
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-900">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-row items-center px-4 pt-2">
          <PressableOpacity accessibilityLabel="Go back" onPress={() => router.back()}>
            <Feather name="arrow-left" size={28} color="#FF7A6E" />
          </PressableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          className="p-8"
          keyboardShouldPersistTaps="handled"
        >
          {secondFactor ? (
            <VerificationCodeForm
              destination={secondFactor.destination}
              onSubmit={onVerifyCode}
              onResend={onResendCode}
              hideResend={secondFactor.strategy === 'totp' || secondFactor.strategy === 'backup_code'}
              isLoading={isLoading}
              onBack={() => setSecondFactor(null)}
            />
          ) : (<>
          <Text className="text-3xl font-black text-gray-900 dark:text-white mb-8">Sign In</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="Email Address"
            placeholderTextColor={colors.placeholder}
            className="w-full bg-gray-100 dark:bg-gray-800 p-4 border border-gray-300 dark:border-gray-700 rounded-lg text-base mb-4"
            style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, color: colors.textPrimary }}
          />

          <View className="w-full flex-row items-center bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-base mb-2 pr-4">
            <TextInput
              ref={passwordRef}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={onSignInPress}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.placeholder}
              secureTextEntry={!isPasswordVisible}
              className="flex-1 p-4 text-base"
              style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, color: colors.textPrimary }}
            />
            <PressableOpacity accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'} onPress={() => setPasswordVisible(!isPasswordVisible)}>
                <Feather
                    name={isPasswordVisible ? 'eye-off' : 'eye'}
                    size={22}
                    color={colors.textMuted}
                />
            </PressableOpacity>
          </View>

          <Link href="/(auth)/forgot-password" asChild>
            <PressableOpacity className="self-end mb-6">
              <Text className="text-base text-gray-600 dark:text-gray-400">Forgot Password?</Text>
            </PressableOpacity>
          </Link>

          <PressableOpacity
            onPress={onSignInPress}
            disabled={isLoading}
            className="w-full py-4 rounded-lg items-center shadow"
            style={{ backgroundColor: colors.brand }}
          >
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Sign In</Text>}
          </PressableOpacity>
          <View className="flex-row justify-center mt-6">
              <Text className="text-base text-gray-600 dark:text-gray-400">Don't have an account? </Text>
              <Link href="/(auth)/sign-up" asChild>
                <PressableOpacity>
                  <Text className="text-base font-bold" style={{ color: colors.brand }}>Sign Up</Text>
                </PressableOpacity>
              </Link>
          </View>
          </>)}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignInScreen;
