// Jest setup: in-memory AsyncStorage (mode, budget, pending providers live there).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
