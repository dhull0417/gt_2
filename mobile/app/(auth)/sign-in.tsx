import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import React, { useState } from 'react';
import { useSignIn } from '@clerk/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';

const SignInScreen = () => {
  const router = useRouter();
  const { signIn } = useSignIn();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setPasswordVisible] = useState(false);

  const onSignInPress = async () => {
    setIsLoading(true);
    try {
      const { error } = await signIn.create({ identifier: email, password });
      if (error) {
        Alert.alert('Error', (error as any).errors?.[0]?.longMessage || error.longMessage || error.message || 'An error occurred during sign in.');
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize();
      } else {
        console.error(JSON.stringify(signIn, null, 2));
      }
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.longMessage || 'An error occurred during sign in.');
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
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={28} color="#FF7A6E" />
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          className="p-8"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-3xl font-black text-gray-900 dark:text-white mb-8">Sign In</Text>
          <TextInput
            autoCapitalize="none"
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
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.placeholder}
              secureTextEntry={!isPasswordVisible}
              className="flex-1 p-4 text-base"
              style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, color: colors.textPrimary }}
            />
            <TouchableOpacity onPress={() => setPasswordVisible(!isPasswordVisible)}>
                <Feather
                    name={isPasswordVisible ? 'eye-off' : 'eye'}
                    size={22}
                    color={colors.textMuted}
                />
            </TouchableOpacity>
          </View>

          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity className="self-end mb-6">
              <Text className="text-base text-gray-600 dark:text-gray-400">Forgot Password?</Text>
            </TouchableOpacity>
          </Link>

          <TouchableOpacity
            onPress={onSignInPress}
            disabled={isLoading}
            className="w-full py-4 rounded-lg items-center shadow"
            style={{ backgroundColor: colors.brand }}
          >
            <Text className="text-white text-lg font-bold">Sign In</Text>
          </TouchableOpacity>
          <View className="flex-row justify-center mt-6">
              <Text className="text-base text-gray-600 dark:text-gray-400">Don't have an account? </Text>
              <Link href="/(auth)/sign-up" asChild>
                <TouchableOpacity>
                  <Text className="text-base font-bold" style={{ color: colors.brand }}>Sign Up</Text>
                </TouchableOpacity>
              </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignInScreen;
