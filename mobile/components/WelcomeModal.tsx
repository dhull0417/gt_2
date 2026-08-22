import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import React, { useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';

// Screen-recorded walkthrough of creating a group. Drop the real recording in at
// this path (mp4, ideally < 10s, no audio needed since the player is muted) —
// see assets/videos/README.md for specs.
const WELCOME_VIDEO = require('../assets/videos/welcome-create-group.mp4');

interface WelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

// Shown once, before profile-setup, for a brand new sign-up — see the
// hasOfferedWelcome gate in app/_layout.tsx. Its only action is "onClose": it
// doesn't navigate anywhere itself, since profile-setup (mandatory) is next
// either way.
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
          <Text className="text-3xl font-black text-gray-900 text-center">
            Welcome to GroupThat!
          </Text>
          <Text className="text-base text-gray-600 text-center mt-2 mb-6">
            Groups are where the planning happens. Here&apos;s how to start yours.
          </Text>

          <View className="rounded-2xl overflow-hidden bg-gray-100" style={styles.videoWrap}>
            <VideoView
              style={StyleSheet.absoluteFill}
              player={player}
              nativeControls={false}
              contentFit="cover"
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

const styles = StyleSheet.create({
  videoWrap: {
    aspectRatio: 9 / 16,
    maxHeight: 480,
  },
});
