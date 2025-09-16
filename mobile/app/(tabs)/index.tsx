import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { User, useApiClient, userApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Link } from 'expo-router';

const HomeScreen = () => {
  const { signOut } = useAuth();
  const api = useApiClient();

  const { data: currentUser, isLoading, isError } = useQuery<User, Error>({
      queryKey: ['currentUser'],
      queryFn: () => userApi.getCurrentUser(api),
  });

  const handleCopyId = async () => {
      if (currentUser?._id) {
          await Clipboard.setStringAsync(currentUser._id);
          Alert.alert("Copied!", "Your User ID has been copied to the clipboard.");
      }
  };

  return (
    <SafeAreaView className='flex-1 bg-gray-100'>
      <View className="flex-row justify-center items-center px-4 py-3 border-b border-gray-200 bg-white">
        <Text className="text-xl font-bold text-gray-900">Home</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {isLoading ? (
            <ActivityIndicator size="large" color="#4f46e5" className="mt-16" />
        ) : isError || !currentUser ? (
            <Text className="text-center text-red-500 mt-8">Failed to load profile.</Text>
        ) : (
          <>
            <View className="items-center p-6 bg-white border-b border-gray-200">
              <Image
                  source={{ uri: currentUser.profilePicture || 'https://placehold.co/200x200/EEE/31343C?text=?' }}
                  className="w-24 h-24 rounded-full border-4 border-gray-200"
              />
              <Text className="text-2xl font-bold text-gray-800 mt-4">
                  {currentUser.firstName} {currentUser.lastName}
              </Text>

              {/* --- ADDED: Display Username and Email --- */}
              <Text className="text-lg text-gray-500">
                  {currentUser.username}
              </Text>
              <Text className="text-base text-gray-500 mt-1">
                  {currentUser.email}
              </Text>

              <View className="w-full bg-gray-100 p-3 mt-6 rounded-lg">
                  <Text className="text-xs text-gray-500 mb-1 text-center">Your Unique User ID (Tap to Copy)</Text>
                  <TouchableOpacity onPress={handleCopyId} className="flex-row justify-center items-center">
                      <Text className="text-sm text-gray-700 font-mono mr-2" selectable>{currentUser._id}</Text>
                      <Feather name="copy" size={16} color="#4f46e5" />
                  </TouchableOpacity>
              </View>
            </View>

            <View className="px-4 mt-8 space-y-4">
                <Link href="/account" asChild>
                    <TouchableOpacity
                        className="py-4 bg-white border border-gray-300 rounded-lg items-center shadow-sm"
                    >
                        <Text className="text-indigo-600 text-lg font-bold">Update Account Info</Text>
                    </TouchableOpacity>
                </Link>
                <TouchableOpacity
                    onPress={() => signOut()}
                    className="py-4 bg-red-600 rounded-lg items-center shadow"
                >
                    <Text className="text-white text-lg font-bold">Sign Out</Text>
                </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

export default HomeScreen;