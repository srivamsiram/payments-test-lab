/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  // Integration tests talk to real Postgres/Kafka, so give them room.
  testTimeout: 30_000,
  clearMocks: true,
};
