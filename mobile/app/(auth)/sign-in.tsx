import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
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
  const [isPasswordVisible, setPasswordVisible] = useState(false);

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
        // The root layout will now handle the redirect automatically
      } else {
        console.error(JSON.stringify(signInAttempt, null, 2));
      }
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.longMessage || 'An error occurred during sign in.');
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
          <Text className="text-3xl font-bold text-gray-800 mb-8">Sign In</Text>
          <TextInput
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
            placeholder="Username or Email"
            placeholderTextColor="#9CA3AF"
            className="w-full bg-gray-100 p-4 border border-gray-300 rounded-lg text-base mb-4"
          />
          
          <View className="w-full flex-row items-center bg-gray-100 border border-gray-300 rounded-lg text-base mb-2 pr-4">
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
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

          {/* --- ADDED: "Forgot Password?" Link --- */}
          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity className="self-end mb-6">
              <Text className="text-base text-gray-600">Forgot Password?</Text>
            </TouchableOpacity>
          </Link>

          <TouchableOpacity
            onPress={onSignInPress}
            disabled={isLoading}
            className={`w-full py-4 rounded-lg items-center shadow ${isLoading ? 'bg-indigo-300' : 'bg-indigo-600'}`}
          >
            <Text className="text-white text-lg font-bold">Sign In</Text>
          </TouchableOpacity>
          <View className="flex-row justify-center mt-6">
              <Text className="text-base text-gray-600">Don't have an account? </Text>
              <Link href="/(auth)/sign-up" asChild>
                <TouchableOpacity>
                  <Text className="text-base text-indigo-600 font-bold">Sign Up</Text>
                </TouchableOpacity>
              </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignInScreen;