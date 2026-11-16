// Jest only: AsyncStorage's native module doesn't exist under Jest. Its own in-memory mock, as the
// library recommends (https://react-native-async-storage.github.io/async-storage/docs/advanced/jest).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
