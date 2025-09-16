import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import React, { useState } from 'react';
import { useSignIn } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

const ForgotPasswordScreen = () => {
  const router = useRouter();
  const { signIn, isLoaded } = useSignIn();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onRequestReset = async () => {
    if (!isLoaded) return;
    setIsLoading(true);
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      // Navigate to the next step
      router.push('/(auth)/reset-password');
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.longMessage || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-row items-center px-4 pt-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={28} color="#4f46e5" />
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          className="p-8"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-3xl font-bold text-gray-800 mb-2">Reset Password</Text>
          <Text className="text-base text-gray-600 mb-8">Enter your email address to receive a verification code.</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="Email Address"
            placeholderTextColor="#9CA3AF"
            className="w-full bg-gray-100 p-4 border border-gray-300 rounded-lg text-base mb-6"
          />
          <TouchableOpacity
            onPress={onRequestReset}
            disabled={isLoading}
            className={`w-full py-4 rounded-lg items-center shadow ${isLoading ? 'bg-indigo-300' : 'bg-indigo-600'}`}
          >
            <Text className="text-white text-lg font-bold">Send Reset Code</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ForgotPasswordScreen;