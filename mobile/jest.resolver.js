// Jest only. Reanimated 4.7 / Worklets 0.13 ship a resolver that loads their web (JS-only)
// files under Jest; without it, importing reanimated crashes looking for the native module.
// It runs on top of React Native's own Jest resolver, which the jest-expo preset would
// otherwise use.
const reactNativeResolver = require('@react-native/jest-preset/jest/resolver');
const reanimatedResolver = require('react-native-reanimated/jest/resolver');

module.exports = (request, options) =>
  reanimatedResolver(request, {
    ...options,
    defaultResolver: (req, opts) =>
      reactNativeResolver(req, { ...opts, defaultResolver: options.defaultResolver }),
  });
