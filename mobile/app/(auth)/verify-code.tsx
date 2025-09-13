import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import React, { useState } from 'react';
import { useSignUp } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const VerifyCodeScreen = () => {
  const router = useRouter();
  const { isLoaded, signUp, setActive } = useSignUp();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onPressVerify = async () => {
    if (!isLoaded) return;
    setIsLoading(true);
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({ code });
      
      if (completeSignUp.status === 'complete') {
        await setActive({ session: completeSignUp.createdSessionId });
        // --- THIS IS THE FIX ---
        // Manually navigate to the main app after the session is active.
        router.replace('/(tabs)');
      } else {
        console.error(JSON.stringify(completeSignUp, null, 2));
      }
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.longMessage || 'An error occurred during verification.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center p-8">
        <Text className="text-3xl font-bold text-gray-800 mb-2">Verify Your Email</Text>
        <Text className="text-base text-gray-600 mb-8">A verification code has been sent to your email address.</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Enter Verification Code..."
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          className="w-full bg-gray-100 p-4 border border-gray-300 rounded-lg text-base mb-6 text-center tracking-widest"
        />
        <TouchableOpacity
          onPress={onPressVerify}
          disabled={isLoading}
          className={`w-full py-4 rounded-lg items-center shadow ${isLoading ? 'bg-indigo-300' : 'bg-indigo-600'}`}
        >
          <Text className="text-white text-lg font-bold">Verify</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default VerifyCodeScreen;