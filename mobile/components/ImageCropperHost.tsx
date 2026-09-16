// Android replacement for expo-image-picker's allowsEditing (its toolbar has no
// visible confirm/cancel there). Mount once near app root, then call requestImageCrop().
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as ImageManipulator from 'expo-image-manipulator';

const MAX_ZOOM = 4;
function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

type CropRequest = {
  uri: string;
  width: number;
  height: number;
  resolve: (uri: string | null) => void;
};

let showCropper: ((uri: string, width: number, height: number) => Promise<string | null>) | null = null;

/** Opens the crop UI for a picked photo. Resolves with the cropped local URI, or null if canceled. */
export function requestImageCrop(uri: string, width: number, height: number): Promise<string | null> {
  if (!showCropper) return Promise.resolve(null);
  return showCropper(uri, width, height);
}

export function ImageCropperHost() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const VIEW_SIZE = Math.min(screenWidth, screenHeight) - 64;

  const [request, setRequest] = useState<CropRequest | null>(null);
  const [processing, setProcessing] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    showCropper = (uri, width, height) => {
      return new Promise((resolve) => {
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        setProcessing(false);
        setRequest({ uri, width, height, resolve });
      });
    };
    return () => {
      showCropper = null;
    };
  }, []);

  const reqWidth = request?.width ?? 1;
  const reqHeight = request?.height ?? 1;
  // "Cover" fit at zoom=1: shorter side fills the crop square, no gaps
  const baseScale = VIEW_SIZE / Math.min(reqWidth, reqHeight);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const next = clamp(savedScale.value * e.scale, 1, MAX_ZOOM);
      scale.value = next;
      const totalScale = baseScale * next;
      const maxX = Math.max((reqWidth * totalScale - VIEW_SIZE) / 2, 0);
      const maxY = Math.max((reqHeight * totalScale - VIEW_SIZE) / 2, 0);
      translateX.value = clamp(translateX.value, -maxX, maxX);
      translateY.value = clamp(translateY.value, -maxY, maxY);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      const totalScale = baseScale * scale.value;
      const maxX = Math.max((reqWidth * totalScale - VIEW_SIZE) / 2, 0);
      const maxY = Math.max((reqHeight * totalScale - VIEW_SIZE) / 2, 0);
      translateX.value = clamp(savedTranslateX.value + e.translationX, -maxX, maxX);
      translateY.value = clamp(savedTranslateY.value + e.translationY, -maxY, maxY);
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const imageStyle = useAnimatedStyle(() => {
    const totalScale = baseScale * scale.value;
    return {
      width: reqWidth * totalScale,
      height: reqHeight * totalScale,
      transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    };
  });

  const handleCancel = () => {
    request?.resolve(null);
    setRequest(null);
  };

  const handleConfirm = async () => {
    if (!request || processing) return;
    setProcessing(true);
    const totalScale = baseScale * scale.value;
    const displayedWidth = reqWidth * totalScale;
    const displayedHeight = reqHeight * totalScale;
    const cropTopLeftX = (displayedWidth - VIEW_SIZE) / 2 - translateX.value;
    const cropTopLeftY = (displayedHeight - VIEW_SIZE) / 2 - translateY.value;
    const size = VIEW_SIZE / totalScale;

    const originX = clamp(cropTopLeftX / totalScale, 0, reqWidth - size);
    const originY = clamp(cropTopLeftY / totalScale, 0, reqHeight - size);

    const activeRequest = request;
    try {
      // Crop and resize in one pass to avoid writing/re-reading a full-res intermediate file
      const cropSize = Math.round(size);
      const result = await ImageManipulator.manipulateAsync(
        activeRequest.uri,
        [
          { crop: { originX: Math.round(originX), originY: Math.round(originY), width: cropSize, height: cropSize } },
          { resize: { width: Math.min(cropSize, 800) } },
        ],
        { format: ImageManipulator.SaveFormat.JPEG },
      );
      activeRequest.resolve(result.uri);
    } catch {
      activeRequest.resolve(null);
    } finally {
      setRequest(null);
    }
  };

  return (
    <Modal visible={!!request} animationType="fade" statusBarTranslucent onRequestClose={handleCancel}>
      {/* Modal has its own native window; needs its own GestureHandlerRootView or gestures silently fail */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleCancel} hitSlop={12} disabled={processing}>
              <Text style={[styles.headerButton, processing && styles.headerButtonDisabled]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Move and Scale</Text>
            <TouchableOpacity onPress={handleConfirm} hitSlop={12} disabled={processing}>
              <Text style={[styles.headerButton, styles.headerButtonPrimary, processing && styles.headerButtonDisabled]}>Choose</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cropArea}>
            {request && (
              <GestureDetector gesture={composedGesture}>
                <View style={StyleSheet.absoluteFillObject}>
                  {/* Full image, dimmed, unclipped — gives context on what's outside the crop. */}
                  <View style={[StyleSheet.absoluteFillObject, styles.centerContent]} pointerEvents="none">
                    <Animated.Image source={{ uri: request.uri }} style={[imageStyle, styles.dimmedImage]} />
                  </View>
                  {/* Same image again, clipped to the crop square, at full brightness. */}
                  <View style={[StyleSheet.absoluteFillObject, styles.centerContent]} pointerEvents="none">
                    <View style={[styles.cropSquare, { width: VIEW_SIZE, height: VIEW_SIZE }]}>
                      <Animated.Image source={{ uri: request.uri }} style={imageStyle} />
                    </View>
                  </View>
                </View>
              </GestureDetector>
            )}

            {processing && (
              <View style={[StyleSheet.absoluteFillObject, styles.processingOverlay]}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.processingText}>Processing photo…</Text>
              </View>
            )}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  headerButton: {
    color: 'white',
    fontSize: 16,
  },
  headerButtonPrimary: {
    color: '#4A90E2',
    fontWeight: '700',
  },
  headerButtonDisabled: {
    opacity: 0.4,
  },
  cropArea: {
    flex: 1,
  },
  processingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  processingText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmedImage: {
    opacity: 0.35,
  },
  cropSquare: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
});
