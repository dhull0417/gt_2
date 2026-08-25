import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert, Share, Modal, Linking, Pressable, Platform, StyleSheet } from 'react-native';
import React, { useCallback, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/utils/layout';
import { useAuth } from '@clerk/expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, useApiClient, userApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Updates from 'expo-updates';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { pickAndUploadImage } from '@/utils/uploadImage';
import { LoadingAnimation } from '@/components/LoadingAnimation';

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
  const { signOut, getToken } = useAuth();
  const api = useApiClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [photoUploading, setPhotoUploading] = useState(false);
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

  const handleChangePhoto = async () => {
    try {
      const token = await getToken({ template: 'supabase' });
      if (!token || !currentUser) return;
      setPhotoUploading(true);
      const url = await pickAndUploadImage(
        'profile-pictures',
        `${currentUser._id}/avatar.jpg`,
        token
      );
      if (url) {
        await userApi.updateProfile(api, { profilePicture: url });
        queryClient.setQueryData(['currentUser'], (old: any) =>
          old ? { ...old, profilePicture: url } : old
        );
      }
    } catch {
      Alert.alert('Error', 'Could not update your profile picture. Please try again.');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleShareApp = async () => {
    try {
      const result = await Share.share(
        Platform.OS === 'ios'
          ? {
              message: 'Join me on GroupThat! The easiest way to coordinate meetups with your group.',
              url: 'https://invite.groupthatapp.com/download',
            }
          : {
              message: 'Join me on GroupThat! The easiest way to coordinate meetups with your group. Download here: https://invite.groupthatapp.com/download',
            }
      );

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

  const ACTIONS = [
    {
      id: 'account',
      label: 'Update Account Info',
      icon: 'user' as const,
      color: '#4A90E2',
      onPress: () => router.push('/account'),
    },
    {
      id: 'share',
      label: 'Share App',
      icon: 'share-2' as const,
      color: '#4FD1C5',
      onPress: handleShareApp,
    },
    {
      id: 'calendar',
      label: 'Sync to My Calendar',
      icon: 'calendar' as const,
      color: '#16A34A',
      onPress: handleOpenCalendarSync,
      loading: calendarLoading,
    },
  ];

  return (
    <SafeAreaView className='flex-1 bg-gray-100' edges={['top', 'left', 'right']}>
      <View className="flex-row justify-center items-center px-4 py-3 border-b border-gray-200 bg-white">
        <Text className="text-xl font-black text-gray-900">
          {currentUser?.firstName ? `${currentUser.firstName}'s Profile` : 'Profile'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 20, flexGrow: 1 }}>
        {isLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><LoadingAnimation /></View>
        ) : isError || !currentUser ? (
            <Text className="text-center text-red-500 mt-8">Failed to load profile.</Text>
        ) : (
          <>
            <View className="items-center p-6 bg-white border-b border-gray-200">
              <TouchableOpacity onPress={handleChangePhoto} disabled={photoUploading} className="relative">
                {photoUploading ? (
                  <View style={styles.avatar} className="border-4 border-gray-200 bg-gray-100 items-center justify-center">
                    <ActivityIndicator color="#4A90E2" />
                  </View>
                ) : currentUser.profilePicture ? (
                  <Image
                    source={{ uri: currentUser.profilePicture }}
                    style={styles.avatar}
                    className="border-4 border-gray-200"
                  />
                ) : (
                  <View style={styles.avatar} className="border-4 border-gray-200 bg-indigo-100 items-center justify-center">
                    <Text className="text-[82px] font-bold text-indigo-600">
                      {(currentUser.firstName?.[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                )}
                <View className="absolute bottom-0 right-0 bg-[#4A90E2] rounded-full p-3.5">
                  <Feather name="camera" size={14} color="white" />
                </View>
              </TouchableOpacity>
              <Text style={styles.name}>
                  {currentUser.firstName} {currentUser.lastName}
              </Text>
              <Text className="text-sm text-gray-400 mt-0.5">
                  {currentUser.email}
              </Text>
              {currentUser.createdAt && (
                <Text className="text-sm text-gray-400 mt-0.5">
                    Joined: {new Date(currentUser.createdAt).toLocaleDateString()}
                </Text>
              )}
            </View>

            <View className="px-4 mt-8">
                <Text style={styles.sectionLabel}>Account</Text>
                {ACTIONS.map((action, index) => (
                  <TouchableOpacity
                    key={action.id}
                    onPress={action.onPress}
                    disabled={action.loading}
                    activeOpacity={0.7}
                    style={[styles.card, styles.row, index < ACTIONS.length - 1 && { marginBottom: 12 }]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: action.color + '18' }]}>
                      <Feather name={action.icon} size={18} color={action.color} />
                    </View>
                    <Text style={styles.rowLabel}>{action.label}</Text>
                    {action.loading
                      ? <ActivityIndicator size="small" color="#9CA3AF" />
                      : <Feather name="chevron-right" size={18} color="#9CA3AF" />}
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                    onPress={() => { queryClient.clear(); signOut(); }}
                    style={[styles.signOutBtn, { marginTop: 28 }]}
                    activeOpacity={0.85}
                >
                    <Feather name="log-out" size={18} color="white" />
                    <Text style={styles.signOutText}>Sign Out</Text>
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

const AVATAR_SIZE = 218;

const styles = StyleSheet.create({
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 32,
  },
  name: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  signOutBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#4A90E2',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
  },
});

export default HomeScreen;