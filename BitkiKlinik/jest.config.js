/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // zustand ve jwt-decode ESM kullandığından transform listesine alıyoruz
  transformIgnorePatterns: [
    'node_modules/(?!(zustand|jwt-decode)/)',
  ],
  moduleNameMapper: {
    '^expo-.*':                                      '<rootDir>/__mocks__/expo.js',
    '^@react-native-async-storage/async-storage$':   '<rootDir>/__mocks__/async-storage.js',
    '^react-native$':                                '<rootDir>/__mocks__/react-native.js',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
          esModuleInterop: true,
          module: 'commonjs',
          target: 'es2020',
          lib: ['es2020'],
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
};
