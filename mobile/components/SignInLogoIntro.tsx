import { useEffect, useState } from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import animationData from '../assets/animations/GroupThat-Basketball.json';
import { LOTTIE_WEB_JS } from '../assets/lottieWebBundle';

interface Props {
  width: number;
  height: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

// Plays once, on top of the static logo it's paired with, then fades away.
// Uses the same WebView + lottie-web approach as LoadingAnimation so it works
// in Expo Go with no native rebuild.
const HTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; height: 100%; }
      #target { width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="target"></div>
    <script>${LOTTIE_WEB_JS}</script>
    <script>
      var anim = lottie.loadAnimation({
        container: document.getElementById('target'),
        renderer: 'svg',
        loop: false,
        autoplay: true,
        animationData: ${JSON.stringify(animationData)}
      });
      anim.addEventListener('complete', function () {
        window.ReactNativeWebView.postMessage('complete');
      });
    </script>
  </body>
</html>
`;

export function SignInLogoIntro({ width, height, delay = 2000, style }: Props) {
  const [playing, setPlaying] = useState(false);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const timer = setTimeout(() => setPlaying(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const handleMessage = (event: WebViewMessageEvent) => {
    if (event.nativeEvent.data === 'complete') {
      opacity.value = withTiming(0, { duration: 400 }, (finished) => {
        if (finished) {
          runOnJS(setPlaying)(false);
        }
      });
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!playing) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { width, height }, animatedStyle, style]}
    >
      <WebView
        source={{ html: HTML }}
        style={styles.webview}
        scrollEnabled={false}
        originWhitelist={['*']}
        androidLayerType="hardware"
        onMessage={handleMessage}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
