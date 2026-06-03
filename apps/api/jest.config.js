/** @type {import('jest').Config} */
const config = {
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/index.ts'],
  coverageDirectory: '<rootDir>/coverage',
  coverageProvider: 'v8',
  coverageReporters: ['text', 'lcov'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  roots: ['<rootDir>/src'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
        useESM: true,
      },
    ],
  },
}

export default config
