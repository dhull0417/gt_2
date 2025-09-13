import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import React, { useState } from 'react';
import { useSignIn } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

const SignInScreen = () => {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSignInPress = async () => {
    if (!isLoaded) return;
    setIsLoading(true);
    try {
      const signInAttempt = await signIn.create({
        identifier: username,
        password,
      });

      if (signInAttempt.status === 'complete') {
        await setActive({ session: signInAttempt.createdSessionId });
      } else {
        console.error(JSON.stringify(signInAttempt, null, 2));
      }
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.message || 'An error occurred during sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center px-4 pt-2">
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={28} color="#4f46e5" />
        </TouchableOpacity>
      </View>
      <View className="flex-1 justify-center p-8">
        <Text className="text-3xl font-bold text-gray-800 mb-8">Sign In</Text>
        <TextInput
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
          placeholder="Username"
          placeholderTextColor="#9CA3AF" // Added this line
          className="w-full bg-gray-100 p-4 border border-gray-300 rounded-lg text-base mb-4"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#9CA3AF" // Added this line
          secureTextEntry
          className="w-full bg-gray-100 p-4 border border-gray-300 rounded-lg text-base mb-6"
        />
        <TouchableOpacity
          onPress={onSignInPress}
          disabled={isLoading}
          className={`w-full py-4 rounded-lg items-center shadow ${isLoading ? 'bg-indigo-300' : 'bg-indigo-600'}`}
        >
          <Text className="text-white text-lg font-bold">Sign In</Text>
        </TouchableOpacity>
        <View className="flex-row justify-center mt-6">
            <Text className="text-base text-gray-600">Don't have an account? </Text>
            <Link href="/(auth)/sign-up">
                <Text className="text-base text-indigo-600 font-bold">Sign Up</Text>
            </Link>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default SignInScreen;
