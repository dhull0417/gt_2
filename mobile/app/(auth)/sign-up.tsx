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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match. Please try again.');
      return;
    }
    setIsLoading(true);
    try {
      const signUpAttempt = await signUp.create({ username, emailAddress: email, password });
      
      if (signUpAttempt.status === 'complete') {
        // Set the session as active, which will update the global auth state
        await setActive({ session: signUpAttempt.createdSessionId });
        // The root layout will now handle the redirect automatically.
      } else {
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
            <View className="w-full flex-row items-center bg-gray-100 border border-gray-300 rounded-lg text-base mb-4 pr-4">
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
            <View className="w-full flex-row items-center bg-gray-100 border border-gray-300 rounded-lg text-base mb-6 pr-4">
                <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm Password"
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