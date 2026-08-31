import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native';
import React, { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';

// Recorded separately per platform (status bar/nav chrome differs) — see assets/videos/README.md
const WELCOME_VIDEO = Platform.select({
  android: require('../assets/videos/welcome-create-group-android.mov'),
  default: require('../assets/videos/welcome-create-group-ios.mov'),
});

interface WelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

// Shown once for hasSeenWelcome === false (see showWelcomeModal in app/_layout.tsx); onClose doesn't navigate.
export function WelcomeModal({ visible, onClose }: WelcomeModalProps) {
  const player = useVideoPlayer(WELCOME_VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Only spend decode/playback resources while the modal is actually on screen.
  useEffect(() => {
    if (visible) {
      player.currentTime = 0;
      player.play();
    } else {
      player.pause();
    }
  }, [visible, player]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <View className="flex-1 px-8 justify-center">
          <Text className="text-3xl font-black text-center">
            <Text className="text-gray-900">Welcome to </Text>
            <Text style={{ color: '#64748B' }}>Group</Text>
            <Text style={{ color: '#4A90E2' }}>That</Text>
            <Text className="text-gray-900">!</Text>
          </Text>
          <Text className="text-base text-gray-600 text-center mt-2 mb-6">
            Groups are where the planning happens. Here&apos;s how to start yours.
          </Text>

          <View className="rounded-2xl overflow-hidden bg-gray-100 self-center items-center justify-center border-4 border-[#4A90E2]" style={styles.videoWrap}>
            <VideoView
              style={StyleSheet.absoluteFill}
              player={player}
              nativeControls={false}
              contentFit="contain"
            />
          </View>
        </View>

        <View className="px-8 pb-4">
          <TouchableOpacity
            onPress={onClose}
            className="w-full py-4 rounded-lg items-center shadow bg-[#4A90E2]"
          >
            <Text className="text-white text-lg font-bold">Let&apos;s go</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// Matches each platform's recording (iOS 1170x2396; Android raw 1496x720 but
// rotated 90° via tkhd, displays 720x1496). Width is capped, not height, so
// self-center has a definite size to shrink against.
const VIDEO_ASPECT_RATIO = Platform.select({ android: 720 / 1496, default: 1170 / 2396 })!;
const VIDEO_MAX_HEIGHT = 480;
const styles = StyleSheet.create({
  videoWrap: {
    width: '100%',
    aspectRatio: VIDEO_ASPECT_RATIO,
    maxHeight: VIDEO_MAX_HEIGHT,
    maxWidth: VIDEO_MAX_HEIGHT * VIDEO_ASPECT_RATIO,
  },
});
