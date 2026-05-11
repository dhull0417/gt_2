import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import React, { useState } from 'react';
import { useSignIn } from '@clerk/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

const ResetPasswordScreen = () => {
  const router = useRouter();
  const { signIn } = useSignIn();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const onReset = async () => {
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (verifyError) {
        Alert.alert('Error', (verifyError as any).errors?.[0]?.longMessage || verifyError.longMessage || verifyError.message || 'An error occurred.');
        return;
      }
      const { error: submitError } = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (submitError) {
        Alert.alert('Error', (submitError as any).errors?.[0]?.longMessage || submitError.longMessage || submitError.message || 'An error occurred.');
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize();
      } else {
        console.error(JSON.stringify(signIn, null, 2));
      }
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
            <Feather name="arrow-left" size={28} color="#FF7A6E" />
          </TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          className="p-8"
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-3xl font-bold text-gray-800 mb-8">Set New Password</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Verification Code"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            className="w-full bg-gray-100 p-4 border border-gray-300 rounded-lg text-base mb-4"
          />
          <View className="w-full flex-row items-center bg-gray-100 border border-gray-300 rounded-lg text-base mb-4 pr-4">
              <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="New Password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!isPasswordVisible}
                  className="flex-1 p-4 text-base"
              />
              <TouchableOpacity onPress={() => setPasswordVisible(!isPasswordVisible)}>
                  <Feather 
                      name={isPasswordVisible ? 'eye-off' : 'eye'} 
                      size={22} 
                      color="#6B7280" 
                  />
              </TouchableOpacity>
          </View>
          <View className="w-full flex-row items-center bg-gray-100 border border-gray-300 rounded-lg text-base mb-6 pr-4">
              <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm New Password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!isConfirmPasswordVisible}
                  className="flex-1 p-4 text-base"
              />
              <TouchableOpacity onPress={() => setConfirmPasswordVisible(!isConfirmPasswordVisible)}>
                  <Feather 
                      name={isConfirmPasswordVisible ? 'eye-off' : 'eye'} 
                      size={22} 
                      color="#6B7280" 
                  />
              </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={onReset}
            disabled={isLoading}
            className={`w-full py-4 rounded-lg items-center shadow ${isLoading ? 'bg-[#4A90E2]' : 'bg-[#4A90E2]'}`}
          >
            <Text className="text-white text-lg font-bold">Save New Password</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ResetPasswordScreen;