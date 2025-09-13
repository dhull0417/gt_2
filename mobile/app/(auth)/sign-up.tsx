import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import React, { useState } from 'react';
import { useSignUp } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { Feather } from '@expo/vector-icons';

const SignUpScreen = () => {
  const router = useRouter();
  const { isLoaded, signUp, setActive } = useSignUp();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    setIsLoading(true);
    try {
      // Create the user
      const signUpAttempt = await signUp.create({ username, emailAddress: email, password });
      
      // If the sign up is complete, set the session active and navigate
      if (signUpAttempt.status === 'complete') {
        await setActive({ session: signUpAttempt.createdSessionId });
        // Replace the current screen with the main app tabs
        router.replace('/(tabs)');
      } else {
        // This may happen if you have other sign-up requirements in Clerk
        console.error(JSON.stringify(signUpAttempt, null, 2));
      }
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.longMessage || 'An error occurred during sign up.');
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
            <Text className="text-3xl font-bold text-gray-800 mb-8">Create Account</Text>
            <TextInput
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
                placeholder="Username"
                placeholderTextColor="#9CA3AF"
                className="w-full bg-gray-100 p-4 border border-gray-300 rounded-lg text-base mb-4"
            />
            <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="Email Address"
                placeholderTextColor="#9CA3AF"
                className="w-full bg-gray-100 p-4 border border-gray-300 rounded-lg text-base mb-4"
            />
            <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                className="w-full bg-gray-100 p-4 border border-gray-300 rounded-lg text-base mb-6"
            />
            <TouchableOpacity
                onPress={onSignUpPress}
                disabled={isLoading}
                className={`w-full py-4 rounded-lg items-center shadow ${isLoading ? 'bg-indigo-300' : 'bg-indigo-600'}`}
            >
                <Text className="text-white text-lg font-bold">Create Account</Text>
            </TouchableOpacity>
            <View className="flex-row justify-center mt-6">
                <Text className="text-base text-gray-600">Already have an account? </Text>
                <Link href="/(auth)/sign-in">
                    <Text className="text-base text-indigo-600 font-bold">Sign In</Text>
                </Link>
            </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
export default SignUpScreen;