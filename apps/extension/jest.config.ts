import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@postmail/shared$': '<rootDir>/../../packages/shared/src',
    '^@postmail/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
  setupFiles: ['<rootDir>/src/test-setup.ts'],
};

export default config;
