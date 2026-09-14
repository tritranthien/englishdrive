module.exports = {
  preset: '@react-native/jest-preset',
  // pnpm stores packages under node_modules/.pnpm. Allow Babel to transform
  // React Native's ESM/Flow sources at their real paths.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/)?(?:(?:@react-native|react-native)(?:\\+|@|/)))',
  ],
};
