/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/services', '<rootDir>/server', '<rootDir>/tests', '<rootDir>/cli', '<rootDir>/lib'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts', '**/tests/**/*.ts'],
  moduleNameMapper: {
    '^@/lib/config$': '<rootDir>/__mocks__/@/lib/config.ts',
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
    }],
  },
  // Skip node_modules except for specific packages that need transformation
  transformIgnorePatterns: [
    'node_modules/(?!(your-esm-packages)/)',
  ],
  // Increase timeout for integration tests
  testTimeout: 30000,
  // Verbose output
  verbose: true,
  // Force exit after tests complete (for integration tests with SSE streams)
  forceExit: true,
};
