import { View, Text, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useRef, useState } from 'react';
import { useSignUp } from '@clerk/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { VerificationCodeForm } from '@/components/auth/VerificationCodeForm';
import { clerkErrorMessage } from '@/utils/clerkErrors';
import { haptic } from '@/utils/haptics';

const SignUpScreen = () => {
  const router = useRouter();
  const { signUp } = useSignUp();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [needsEmailCode, setNeedsEmailCode] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const onSignUpPress = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing Information', 'Please enter your email and a password.');
      return;
    }
    if (password !== confirmPassword) {
      haptic.error();
      Alert.alert('Error', 'Passwords do not match. Please try again.');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await signUp.create({ emailAddress: email.trim(), password });
      if (error) {
        haptic.error();
        Alert.alert('Error', clerkErrorMessage(error, 'An error occurred during sign up.'));
        return;
      }
      if (signUp.status === 'complete') {
        await signUp.finalize();
      } else if (signUp.unverifiedFields?.includes('email_address')) {
        // Clerk needs the email confirmed before the account exists: send the code and ask for it.
        const { error: sendError } = await signUp.verifications.sendEmailCode();
        if (sendError) {
          Alert.alert('Error', clerkErrorMessage(sendError, "We couldn't send the verification code."));
          return;
        }
        setNeedsEmailCode(true);
      } else {
        Alert.alert('One more step', `We couldn't finish creating your account (${signUp.status}). Please try again or use another sign-in option.`);
      }
    } catch (err: any) {
      haptic.error();
      Alert.alert('Error', clerkErrorMessage(err, 'An error occurred during sign up.'));
    } finally {
      setIsLoading(false);
    }
  };

  const onVerifyCode = async (code: string) => {
    setIsLoading(true);
    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code });
      if (error) {
        haptic.error();
        Alert.alert("That code didn't work", clerkErrorMessage(error, 'Check the code and try again.'));
        return;
      }
      if (signUp.status === 'complete') {
        await signUp.finalize();
      } else {
        Alert.alert('One more step', `We couldn't finish creating your account (${signUp.status}).`);
      }
    } catch (err: any) {
      haptic.error();
      Alert.alert('Error', clerkErrorMessage(err, 'Verification failed.'));
    } finally {
      setIsLoading(false);
    }
  };

  const onResendCode = async () => {
    const { error } = await signUp.verifications.sendEmailCode();
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
          {needsEmailCode ? (
            <VerificationCodeForm
              destination={email.trim()}
              onSubmit={onVerifyCode}
              onResend={onResendCode}
              isLoading={isLoading}
              onBack={() => setNeedsEmailCode(false)}
            />
          ) : (<>
            <Text className="text-3xl font-black text-gray-900 dark:text-white mb-8">Create Account</Text>
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
            <View className="w-full flex-row items-center bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-base mb-4 pr-4">
                <TextInput
                    ref={passwordRef}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="next"
                    onSubmitEditing={() => confirmRef.current?.focus()}
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
            <View className="w-full flex-row items-center bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-base mb-6 pr-4">
                <TextInput
                    ref={confirmRef}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={onSignUpPress}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm Password"
                    placeholderTextColor={colors.placeholder}
                    secureTextEntry={!isConfirmPasswordVisible}
                    className="flex-1 p-4 text-base"
                    style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, color: colors.textPrimary }}
                />
                <PressableOpacity accessibilityLabel={isConfirmPasswordVisible ? 'Hide password' : 'Show password'} onPress={() => setConfirmPasswordVisible(!isConfirmPasswordVisible)}>
                    <Feather
                        name={isConfirmPasswordVisible ? 'eye-off' : 'eye'}
                        size={22}
                        color={colors.textMuted}
                    />
                </PressableOpacity>
            </View>
            <PressableOpacity
                onPress={onSignUpPress}
                disabled={isLoading}
                className="w-full py-4 rounded-lg items-center shadow"
                style={{ backgroundColor: colors.brand }}
            >
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Create Account</Text>}
            </PressableOpacity>
            <View className="flex-row justify-center mt-6">
                <Text className="text-base text-gray-600 dark:text-gray-400">Already have an account? </Text>
                <Link href="/(auth)/sign-in">
                    <Text className="text-base font-bold" style={{ color: colors.brand }}>Sign In</Text>
                </Link>
            </View>
          </>)}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
export default SignUpScreen;
