/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/mocks/style-mock.ts',
  },
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          transform: { react: { runtime: 'automatic' } },
          parser: { syntax: 'typescript', tsx: true },
        },
      },
    ],
  },
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}', '<rootDir>/src/**/*.test.{ts,tsx}'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/app/**/layout.tsx',
    '!src/app/**/page.tsx',
    '!src/lib/db/**',
  ],
  // Coverage thresholds for services/ and repositories/ are reintroduced
  // in M1 alongside the first source files those globs match. Jest treats
  // a threshold whose glob matches zero files as a failure, which would
  // break CI before the M1 code lands.
  clearMocks: true,
};

module.exports = config;
