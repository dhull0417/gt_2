import { View, Text, ScrollView, ActivityIndicator, Image, Alert, Share, Modal, Linking, Pressable, Platform, StyleSheet, RefreshControl } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabScreenBottomPadding } from '@/utils/layout';
import { useAuth } from '@clerk/expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, useApiClient, userApi } from '@/utils/api';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { pickAndUploadImage } from '@/utils/uploadImage';
import { getUserDisplayName } from '@/utils/groupDisplay';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { useContentTopInset } from '@/hooks/useContentTopInset';
import { useAppearance, useThemeColors, type ThemePreference } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';
import { unregisterPushToken } from '@/hooks/usePushNotifications';

const CALENDAR_OPTIONS = [
  {
    id: 'apple',
    label: 'Apple Calendar',
    icon: 'smartphone' as const,
    color: '#1C1C1E',
    // Apple's near-black tint reads fine on a white light-mode circle, but disappears
    // on a dark surface — swap to white when in dark mode instead.
    darkColor: '#FFFFFF',
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

const APPEARANCE_OPTIONS: { key: ThemePreference; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { key: 'light', label: 'Light', icon: 'sun' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
  { key: 'system', label: 'System', icon: 'smartphone' },
];

const HomeScreen = () => {
  const { signOut, getToken } = useAuth();
  const api = useApiClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const contentTopInset = useContentTopInset();
  const queryClient = useQueryClient();
  const { preference, setPreference, scheme } = useAppearance();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
      id: 'premium',
      label: currentUser?.isPremium ? 'GroupThat Premium (Active)' : 'Get GroupThat Premium',
      icon: 'star' as const,
      color: colors.warning,
      onPress: () => router.push('/paywall'),
    },
    {
      id: 'account',
      label: 'Update Account Info',
      icon: 'user' as const,
      color: colors.brand,
      onPress: () => router.push('/account'),
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: 'bell' as const,
      color: '#7C3AED',
      onPress: () => router.push('/account/notifications'),
    },
    {
      id: 'share',
      label: 'Share App',
      icon: 'share-2' as const,
      color: colors.accentTeal,
      onPress: handleShareApp,
    },
    {
      id: 'calendar',
      label: 'Sync to My Calendar',
      icon: 'calendar' as const,
      color: colors.success,
      onPress: handleOpenCalendarSync,
      loading: calendarLoading,
    },
  ];

  return (
    <SafeAreaView
      className='flex-1 bg-gray-100 dark:bg-black'
      edges={['left', 'right']}
      style={{ paddingTop: contentTopInset }}
    >
      <View className="flex-row justify-center items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <Text className="text-xl font-black text-gray-900 dark:text-gray-100">
          {currentUser?.firstName ? `${currentUser.firstName}'s Profile` : 'Profile'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: tabScreenBottomPadding(insets.bottom) + 20, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { refetch(); }} tintColor={colors.brand} colors={[colors.brand]} />}
      >
        {isLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><LoadingAnimation /></View>
        ) : isError || !currentUser ? (
            <View style={{ alignItems: 'center', marginTop: 48 }}>
              <Text style={{ color: colors.textMuted, fontSize: 16, marginBottom: 16 }}>Couldn't load your profile.</Text>
              <PressableOpacity onPress={() => refetch()} style={{ backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Try again</Text>
              </PressableOpacity>
            </View>
        ) : (
          <>
            <View className="items-center p-6 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
              <PressableOpacity onPress={handleChangePhoto} disabled={photoUploading} className="relative">
                {photoUploading ? (
                  <View style={styles.avatar} className="border-4 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 items-center justify-center">
                    <ActivityIndicator color={colors.brand} />
                  </View>
                ) : currentUser.profilePicture ? (
                  <Image
                    source={{ uri: currentUser.profilePicture }}
                    style={styles.avatar}
                    className="border-4 border-gray-200 dark:border-gray-700"
                  />
                ) : (
                  <View style={styles.avatar} className="border-4 border-gray-200 dark:border-gray-700 bg-indigo-100 dark:bg-indigo-900 items-center justify-center">
                    <Text className="text-[82px] font-bold text-indigo-600 dark:text-indigo-300">
                      {(currentUser.firstName?.[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                )}
                <View className="absolute bottom-0 right-0 rounded-full p-3.5" style={{ backgroundColor: colors.brand }}>
                  <Feather name="camera" size={14} color="white" />
                </View>
              </PressableOpacity>
              <Text style={styles.name}>
                  {getUserDisplayName(currentUser)}
              </Text>
              <Text className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                  {currentUser.email}
              </Text>
              {currentUser.createdAt && (
                <Text className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                    Joined: {new Date(currentUser.createdAt).toLocaleDateString()}
                </Text>
              )}
            </View>

            <View className="px-4 mt-8">
                <Text style={styles.sectionLabel}>Appearance</Text>
                <View style={[styles.card, { flexDirection: 'row', padding: 4 }]}>
                  {APPEARANCE_OPTIONS.map((option) => {
                    const active = preference === option.key;
                    return (
                      <PressableOpacity
                        key={option.key}
                        onPress={() => setPreference(option.key)}
                        activeOpacity={0.8}
                        style={[
                          styles.appearanceSegment,
                          active && { backgroundColor: colors.brand },
                        ]}
                      >
                        <Feather name={option.icon} size={16} color={active ? 'white' : colors.textMuted} />
                        <Text style={[styles.appearanceSegmentLabel, active && { color: 'white' }]}>
                          {option.label}
                        </Text>
                      </PressableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Account</Text>
                {ACTIONS.map((action, index) => (
                  <PressableOpacity
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
                      ? <ActivityIndicator size="small" color={colors.textFaint} />
                      : <Feather name="chevron-right" size={18} color={colors.textFaint} />}
                  </PressableOpacity>
                ))}

                <PressableOpacity
                    onPress={async () => { await unregisterPushToken(api); queryClient.clear(); signOut(); }}
                    style={[styles.signOutBtn, { marginTop: 28 }]}
                    activeOpacity={0.85}
                >
                    <Feather name="log-out" size={18} color="white" />
                    <Text style={styles.signOutText}>Sign Out</Text>
                </PressableOpacity>

                <View style={{ alignItems: 'center', marginTop: 24 }}>
                  <PressableOpacity onPress={() => Linking.openURL('https://groupthatapp.com/privacy-policy/').catch(() => {})}>
                    <Text style={{ color: colors.textFaint, fontSize: 13, textDecorationLine: 'underline' }}>Privacy Policy</Text>
                  </PressableOpacity>
                  <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 8 }}>
                    GroupThat {Constants.expoConfig?.version ?? ''}
                  </Text>
                </View>
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
            <View className="bg-white dark:bg-gray-900 rounded-t-3xl px-6 pt-5 pb-10">
              <View className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full self-center mb-5" />

              {googleStep ? (
                <>
                  <PressableOpacity
                    onPress={() => setGoogleStep(false)}
                    className="flex-row items-center mb-4"
                  >
                    <Feather name="arrow-left" size={18} color={colors.textMuted} />
                    <Text className="text-gray-500 dark:text-gray-400 text-sm ml-1">Back</Text>
                  </PressableOpacity>
                  <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Step 1 of 2</Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Copy your sync link now — you'll paste it into Google Calendar on the next screen.
                  </Text>
                  <PressableOpacity
                    onPress={handleCopyLink}
                    className="flex-row items-center justify-center py-4 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 mb-4"
                  >
                    <Feather name={urlCopied ? 'check' : 'copy'} size={18} color={urlCopied ? colors.success : colors.brand} />
                    <Text className={`ml-2 font-semibold text-base ${urlCopied ? 'text-green-600 dark:text-green-400' : ''}`} style={urlCopied ? undefined : { color: colors.brand }}>
                      {urlCopied ? 'Copied!' : 'Copy Sync Link'}
                    </Text>
                  </PressableOpacity>
                  <PressableOpacity
                    onPress={handleGoogleNext}
                    className="flex-row items-center justify-center py-4 bg-[#4285F4] rounded-xl"
                  >
                    <Text className="text-white font-bold text-base mr-2">Next — Open Google Calendar</Text>
                    <Feather name="arrow-right" size={18} color="white" />
                  </PressableOpacity>
                </>
              ) : (
                <>
                  <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Add to Calendar</Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Choose your calendar app to subscribe and stay in sync.
                  </Text>

                  {/* Apple Calendar's webcal:// link can't open on Android (every tap said "Cannot Open"). */}
                  {CALENDAR_OPTIONS.filter((option) => Platform.OS === 'ios' || option.id !== 'apple').map((option) => {
                    const iconColor = scheme === 'dark' && option.darkColor ? option.darkColor : option.color;
                    return (
                      <PressableOpacity
                        key={option.id}
                        onPress={() => handleOpenCalendarApp(option)}
                        className="flex-row items-center py-4 border-b border-gray-100 dark:border-gray-800"
                      >
                        <View className="w-10 h-10 rounded-full items-center justify-center mr-4" style={{ backgroundColor: iconColor + '18' }}>
                          <Feather name={option.icon} size={20} color={iconColor} />
                        </View>
                        <Text className="text-gray-800 dark:text-gray-200 text-base font-semibold flex-1">{option.label}</Text>
                        <Feather name="chevron-right" size={18} color={colors.textFaint} />
                      </PressableOpacity>
                    );
                  })}

                  <PressableOpacity
                    onPress={() => setShowOtherInstructions(prev => !prev)}
                    className="flex-row items-center py-4"
                  >
                    <View className="w-10 h-10 rounded-full items-center justify-center mr-4 bg-gray-100 dark:bg-gray-800">
                      <Feather name="more-horizontal" size={20} color={colors.textMuted} />
                    </View>
                    <Text className="text-gray-800 dark:text-gray-200 text-base font-semibold flex-1">Other</Text>
                    <Feather name={showOtherInstructions ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textFaint} />
                  </PressableOpacity>

                  {showOtherInstructions && (
                    <View className="bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-4 mb-2">
                      <Text className="text-sm text-gray-600 dark:text-gray-300 leading-5 mb-4">
                        Copy the link below and paste it into your calendar app's "Subscribe from URL" or "Add calendar by URL" setting to stay in sync.
                      </Text>
                      <PressableOpacity
                        onPress={handleCopyLink}
                        className="flex-row items-center justify-center py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                      >
                        <Feather name={urlCopied ? 'check' : 'copy'} size={16} color={urlCopied ? colors.success : colors.brand} />
                        <Text className={`ml-2 font-semibold text-sm ${urlCopied ? 'text-green-600 dark:text-green-400' : ''}`} style={urlCopied ? undefined : { color: colors.brand }}>
                          {urlCopied ? 'Copied!' : 'Copy Sync Link'}
                        </Text>
                      </PressableOpacity>
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 32,
  },
  name: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.textSecondary,
  },
  appearanceSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  appearanceSegmentLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  signOutBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.brand,
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
