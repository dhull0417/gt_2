import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

interface Props {
  visible: boolean;
  imageUrl: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export function ChatImageViewer({ visible, imageUrl, imageWidth, imageHeight, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const viewerHeight = height * 0.85;

  // Rendered image box within the letterboxed container, so panning clamps to
  // the image edges, not the empty space. Falls back to full container if no
  // stored dimensions (legacy messages).
  const imageAspect = imageWidth && imageHeight ? imageWidth / imageHeight : width / viewerHeight;
  const containerAspect = width / viewerHeight;
  const contentWidth = imageAspect > containerAspect ? width : viewerHeight * imageAspect;
  const contentHeight = imageAspect > containerAspect ? width / imageAspect : viewerHeight;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Start fresh each time a (new) image is opened.
  useEffect(() => {
    if (!visible) return;
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [visible, imageUrl]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const nextScale = Math.min(Math.max(savedScale.value * e.scale, MIN_SCALE), MAX_SCALE);
      scale.value = nextScale;

      // Clamp pan back in bounds live as the image shrinks
      const maxX = Math.max(0, (contentWidth * nextScale - width) / 2);
      const maxY = Math.max(0, (contentHeight * nextScale - viewerHeight) / 2);
      translateX.value = Math.min(Math.max(translateX.value, -maxX), maxX);
      translateY.value = Math.min(Math.max(translateY.value, -maxY), maxY);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      const maxX = Math.max(0, (contentWidth * scale.value - width) / 2);
      const maxY = Math.max(0, (contentHeight * scale.value - viewerHeight) / 2);
      translateX.value = Math.min(Math.max(savedTranslateX.value + e.translationX, -maxX), maxX);
      translateY.value = Math.min(Math.max(savedTranslateY.value + e.translationY, -maxY), maxY);
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {imageUrl && (
          <GestureDetector gesture={composedGesture}>
            <Animated.View style={[{ width, height: viewerHeight }, animatedImageStyle]}>
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                contentFit="contain"
                transition={100}
              />
            </Animated.View>
          </GestureDetector>
        )}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.closeBtn, { top: insets.top + 12 }]}
        >
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
