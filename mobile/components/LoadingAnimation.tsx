import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import animationData from '../assets/animations/logo-loading-animation.json';
import { LOTTIE_WEB_JS } from '../assets/lottieWebBundle';

interface Props {
  size?: number;
}

// Native Lottie (lottie-react-native) when it is installed in the build; otherwise the old
// lottie-web-in-a-WebView renderer so the app keeps working until the dependency is added
// (Metro treats a require inside try/catch as optional).
let NativeLottie: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('lottie-react-native');
  NativeLottie = mod?.default ?? mod;
} catch {
  NativeLottie = null;
}

// WebView fallback HTML.
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
  if (NativeLottie) {
    return (
      <View style={[styles.wrap, { width: size, height: size }]} pointerEvents="none">
        <NativeLottie source={animationData} autoPlay loop style={{ width: size, height: size }} />
      </View>
    );
  }
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
