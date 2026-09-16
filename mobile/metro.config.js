const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Native Gradle/Xcode build output under node_modules gets created and torn down during
// native builds. Metro's Windows file watcher throws (ENOENT) if a directory it's watching
// disappears mid-scan instead of skipping it, so these never-relevant-to-JS paths must be
// excluded from watching rather than just left to be crawled.
config.resolver.blockList = [
  /node_modules\/.*\/android\/(build|\.cxx|\.gradle)\/.*/,
  /node_modules\/.*\/ios\/(build|Pods)\/.*/,
];

module.exports = withNativeWind(config, { input: './global.css' });