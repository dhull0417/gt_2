// Marks hardware features that Google Play infers from the manifest as optional.
//
// Play treats implied features as required, which blocks installs on devices
// without them (tablets, Chromebooks, Android XR):
//   - android.hardware.screen.portrait  <- implied by "orientation": "portrait"
//   - android.hardware.wifi             <- implied by ACCESS_WIFI_STATE (added by a dependency)
// Declaring them explicitly with required="false" overrides the inference.
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL_FEATURES = [
  'android.hardware.screen.portrait',
  'android.hardware.wifi',
];

module.exports = function withOptionalHardwareFeatures(config, extra = []) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] || [];

    for (const name of [...OPTIONAL_FEATURES, ...extra]) {
      const existing = manifest['uses-feature'].find(
        (f) => f.$ && f.$['android:name'] === name
      );
      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        manifest['uses-feature'].push({
          $: { 'android:name': name, 'android:required': 'false' },
        });
      }
    }
    return cfg;
  });
};
