module.exports = {
  preset: '@react-native/jest-preset',
  transform: {
    '^.+\\.(js|ts|tsx)$': require.resolve('babel-jest', {
      paths: [require.resolve('@react-native/jest-preset')],
    }),
    '^.+\\.mjs$': require.resolve('babel-jest', {
      paths: [require.resolve('@react-native/jest-preset')],
    }),
  },
  // pnpm stores packages under node_modules/.pnpm. Allow Babel to transform
  // React Native's ESM/Flow sources at their real paths.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/)?(?:@react-native(?:\\+|/)|@react-navigation(?:\\+|/)|react-native(?:@|/|-)|lucide-react-native(?:@|/)|nanoid(?:@|/)))',
  ],
};
