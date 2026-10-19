import { View, Text, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useState } from 'react';
import { useSignIn } from '@clerk/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';

const ForgotPasswordScreen = () => {
  const router = useRouter();
  const { signIn } = useSignIn();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onRequestReset = async () => {
    setIsLoading(true);
    try {
      const { error: createError } = await signIn.create({ identifier: email });
      if (createError) {
        Alert.alert('Error', (createError as any).errors?.[0]?.longMessage || createError.longMessage || createError.message || 'An error occurred.');
        return;
      }
      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) {
        Alert.alert('Error', (sendError as any).errors?.[0]?.longMessage || sendError.longMessage || sendError.message || 'An error occurred.');
        return;
      }
      router.push('/(auth)/reset-password');
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.longMessage || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
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
          <Text className="text-3xl font-black text-gray-900 dark:text-white mb-2">Reset Password</Text>
          <Text className="text-base text-gray-600 dark:text-gray-400 mb-8">Enter your email address to receive a verification code.</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="Email Address"
            placeholderTextColor={colors.placeholder}
            className="w-full bg-gray-100 dark:bg-gray-800 p-4 border border-gray-300 dark:border-gray-700 rounded-lg text-base mb-6"
            style={{ color: colors.textPrimary }}
          />
          <PressableOpacity
            onPress={onRequestReset}
            disabled={isLoading}
            className="w-full py-4 rounded-lg items-center shadow"
            style={{ backgroundColor: colors.brand }}
          >
            <Text className="text-white text-lg font-bold">Send Reset Code</Text>
          </PressableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ForgotPasswordScreen;
