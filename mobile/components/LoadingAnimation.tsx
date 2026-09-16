import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import animationData from '../assets/animations/logo-loading-animation.json';
import { LOTTIE_WEB_JS } from '../assets/lottieWebBundle';

interface Props {
  size?: number;
}

// Renders via lottie-web in a WebView (not native lottie-react-native) so it works in
// Expo Go without a rebuild. Swap to native once building a dev client.
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
      lottie.loadAnimation({
        container: document.getElementById('target'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: ${JSON.stringify(animationData)}
      });
    </script>
  </body>
</html>
`;

export function LoadingAnimation({ size = 119 }: Props) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]} pointerEvents="none">
      <WebView
        source={{ html: HTML }}
        style={styles.webview}
        scrollEnabled={false}
        originWhitelist={['*']}
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
