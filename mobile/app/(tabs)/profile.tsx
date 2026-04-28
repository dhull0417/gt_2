import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert, Share, Modal, Linking, Pressable } from 'react-native';
import React, { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, useApiClient, userApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Updates from 'expo-updates';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';

const CALENDAR_OPTIONS = [
  {
    id: 'apple',
    label: 'Apple Calendar',
    icon: 'smartphone' as const,
    color: '#1C1C1E',
    useWebBrowser: false,
    getUrl: (icsUrl: string) => icsUrl.replace(/^https?:\/\//, 'webcal://'),
  },
  {
    id: 'google',
    label: 'Google Calendar',
    icon: 'calendar' as const,
    color: '#4285F4',
    useWebBrowser: true,
    getUrl: (icsUrl: string) => `https://calendar.google.com/calendar/u/0/r/settings/addbyurl?hl=en&url=${encodeURIComponent(icsUrl)}`,
  },
];

const HomeScreen = () => {
  const { signOut } = useAuth();
  const api = useApiClient();
  const router = useRouter();
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showOtherInstructions, setShowOtherInstructions] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [googleStep, setGoogleStep] = useState(false);

  const { data: currentUser, isLoading, isError, refetch } = useQuery<User, Error>({
      queryKey: ['currentUser'],
      queryFn: () => userApi.getCurrentUser(api),
  });

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const handleShareUsername = async () => {
      if (currentUser?.username) {
          try {
              await Share.share({
                  message: `Add me on GroupThat! My username is: ${currentUser.username}`,
              });
          } catch (error: any) {
              Alert.alert(error.message);
          }
      }
  };

  const handleShareApp = async () => {
    try {
      // You can customize this message and URL
      const result = await Share.share({
        message: 'Join me on GroupThat! Organize groups and meetups easily. Download the app here: https://dhull0417.github.io/groupthat-testing/',
      });

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          // shared with activity type of result.activityType
        } else {
          // shared
        }
      } else if (result.action === Share.dismissedAction) {
        // dismissed
      }
    } catch (error: any) {
      Alert.alert(error.message);
    }
  };

  const handleCheckForUpdate = async () => {
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        Alert.alert('Update Downloaded', 'The app will restart to apply the update.', [
          { text: 'Restart', onPress: () => Updates.reloadAsync() },
        ]);
      } else {
        Alert.alert('No Update', 'You are already running the latest version.');
      }
    } catch (error: any) {
      Alert.alert('Error Checking', error.message);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This cannot be undone.\n\nAll your data, messages, and any groups you own will be deleted or transferred.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'This will permanently delete your account from GroupThat. There is no way to recover it.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleteLoading(true);
                    try {
                      await userApi.deleteAccount(api);
                      await signOut();
                    } catch {
                      Alert.alert('Error', 'Something went wrong while deleting your account. Please try again.');
                    } finally {
                      setDeleteLoading(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleOpenCalendarSync = async () => {
    setCalendarLoading(true);
    try {
      const { url } = await userApi.getCalendarSyncUrl(api);
      setCalendarUrl(url);
      setShowOtherInstructions(false);
      setUrlCopied(false);
      setGoogleStep(false);
      setCalendarModalVisible(true);
    } catch {
      Alert.alert('Error', 'Could not generate your calendar sync link. Please try again.');
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleOpenCalendarApp = (option: typeof CALENDAR_OPTIONS[number]) => {
    if (!calendarUrl) return;
    if (option.id === 'google') {
      setUrlCopied(false);
      setGoogleStep(true);
      return;
    }
    setCalendarModalVisible(false);
    setTimeout(() => {
      Linking.canOpenURL(option.getUrl(calendarUrl)).then(supported => {
        if (supported) {
          Linking.openURL(option.getUrl(calendarUrl));
        } else {
          Alert.alert('Cannot Open', 'This calendar app could not be opened on your device.');
        }
      });
    }, 350);
  };

  const handleGoogleNext = () => {
    if (!calendarUrl) return;
    const target = CALENDAR_OPTIONS.find(o => o.id === 'google')!.getUrl(calendarUrl);
    WebBrowser.openBrowserAsync(target).then(() => {
      setCalendarModalVisible(false);
      setGoogleStep(false);
    });
  };

  const handleCopyLink = async () => {
    if (!calendarUrl) return;
    await Clipboard.setStringAsync(calendarUrl);
    setUrlCopied(true);
  };

  return (
    <SafeAreaView className='flex-1 bg-gray-100'>
      <View className="flex-row justify-center items-center px-4 py-3 border-b border-gray-200 bg-white">
        <Text className="text-xl font-bold text-gray-900">Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {isLoading ? (
            <ActivityIndicator size="large" color="#4A90E2" className="mt-16" />
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
              <Text className="text-lg text-gray-500">
                  @{currentUser.username}
              </Text>
              <Text className="text-base text-gray-500 mt-1">
                  {currentUser.email}
              </Text>
              <TouchableOpacity onPress={handleShareUsername} className="mt-6 flex-row items-center bg-gray-100 px-4 py-2 rounded-full">
                  <Feather name="share" size={14} color="#6B7280" />
                  <Text className="text-gray-600 text-sm ml-2 font-medium">Share Username</Text>
              </TouchableOpacity>
            </View>

            <View className="px-4 mt-8 space-y-4">
                <TouchableOpacity
                    onPress={() => router.push('/account')}
                    className="py-4 bg-white border border-gray-300 rounded-lg items-center shadow-sm"
                >
                    <Text className="text-[#4A90E2] text-lg font-bold">Update Account Info</Text>
                </TouchableOpacity>

                {/* 👇 NEW SHARE BUTTON 👇 */}
                <TouchableOpacity
                    onPress={handleShareApp}
                    className="py-4 bg-white border border-gray-300 rounded-lg items-center shadow-sm"
                >
                    <View className="flex-row items-center">
                        <Feather name="share-2" size={20} color="#4A90E2" className="mr-2" />
                        <Text className="text-[#4A90E2] text-lg font-bold ml-2">Share App</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleOpenCalendarSync}
                    disabled={calendarLoading}
                    className="py-4 bg-white border border-gray-300 rounded-lg items-center shadow-sm"
                >
                    <View className="flex-row items-center">
                        {calendarLoading
                          ? <ActivityIndicator size="small" color="#4A90E2" />
                          : <Feather name="calendar" size={20} color="#4A90E2" />}
                        <Text className="text-[#4A90E2] text-lg font-bold ml-2">Sync to My Calendar</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => { queryClient.clear(); signOut(); }}
                    className="py-4 bg-red-600 rounded-lg items-center shadow"
                >
                    <Text className="text-white text-lg font-bold">Sign Out</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleDeleteAccount}
                    disabled={deleteLoading}
                    className="py-4 items-center"
                >
                    {deleteLoading
                      ? <ActivityIndicator size="small" color="#EF4444" />
                      : <Text className="text-red-500 text-base font-medium">Delete Account</Text>}
                </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={calendarModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCalendarModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={() => setCalendarModalVisible(false)}
        >
          <Pressable onPress={() => {}}>
            <View className="bg-white rounded-t-3xl px-6 pt-5 pb-10">
              <View className="w-10 h-1 bg-gray-300 rounded-full self-center mb-5" />

              {googleStep ? (
                <>
                  <TouchableOpacity
                    onPress={() => setGoogleStep(false)}
                    className="flex-row items-center mb-4"
                  >
                    <Feather name="arrow-left" size={18} color="#6B7280" />
                    <Text className="text-gray-500 text-sm ml-1">Back</Text>
                  </TouchableOpacity>
                  <Text className="text-xl font-bold text-gray-900 mb-1">Step 1 of 2</Text>
                  <Text className="text-sm text-gray-500 mb-6">
                    Copy your sync link now — you'll paste it into Google Calendar on the next screen.
                  </Text>
                  <TouchableOpacity
                    onPress={handleCopyLink}
                    className="flex-row items-center justify-center py-4 rounded-xl border border-gray-300 bg-gray-50 mb-4"
                  >
                    <Feather name={urlCopied ? 'check' : 'copy'} size={18} color={urlCopied ? '#16A34A' : '#4A90E2'} />
                    <Text className={`ml-2 font-semibold text-base ${urlCopied ? 'text-green-600' : 'text-[#4A90E2]'}`}>
                      {urlCopied ? 'Copied!' : 'Copy Sync Link'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleGoogleNext}
                    className="flex-row items-center justify-center py-4 bg-[#4285F4] rounded-xl"
                  >
                    <Text className="text-white font-bold text-base mr-2">Next — Open Google Calendar</Text>
                    <Feather name="arrow-right" size={18} color="white" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text className="text-xl font-bold text-gray-900 mb-1">Add to Calendar</Text>
                  <Text className="text-sm text-gray-500 mb-6">
                    Choose your calendar app to subscribe and stay in sync.
                  </Text>

                  {CALENDAR_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      onPress={() => handleOpenCalendarApp(option)}
                      className="flex-row items-center py-4 border-b border-gray-100"
                    >
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-4" style={{ backgroundColor: option.color + '18' }}>
                        <Feather name={option.icon} size={20} color={option.color} />
                      </View>
                      <Text className="text-gray-800 text-base font-semibold flex-1">{option.label}</Text>
                      <Feather name="chevron-right" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    onPress={() => setShowOtherInstructions(prev => !prev)}
                    className="flex-row items-center py-4"
                  >
                    <View className="w-10 h-10 rounded-full items-center justify-center mr-4 bg-gray-100">
                      <Feather name="more-horizontal" size={20} color="#6B7280" />
                    </View>
                    <Text className="text-gray-800 text-base font-semibold flex-1">Other</Text>
                    <Feather name={showOtherInstructions ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
                  </TouchableOpacity>

                  {showOtherInstructions && (
                    <View className="bg-gray-50 rounded-xl px-4 py-4 mb-2">
                      <Text className="text-sm text-gray-600 leading-5 mb-4">
                        Copy the link below and paste it into your calendar app's "Subscribe from URL" or "Add calendar by URL" setting to stay in sync.
                      </Text>
                      <TouchableOpacity
                        onPress={handleCopyLink}
                        className="flex-row items-center justify-center py-3 rounded-xl border border-gray-300 bg-white"
                      >
                        <Feather name={urlCopied ? 'check' : 'copy'} size={16} color={urlCopied ? '#16A34A' : '#4A90E2'} />
                        <Text className={`ml-2 font-semibold text-sm ${urlCopied ? 'text-green-600' : 'text-[#4A90E2]'}`}>
                          {urlCopied ? 'Copied!' : 'Copy Sync Link'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

export default HomeScreen;