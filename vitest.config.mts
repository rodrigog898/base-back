import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'mongodb://localhost:27017/test',
      JWT_ACCESS_SECRET: 'test-access-0123456789abcdef0123456789abcdef',
      JWT_REFRESH_SECRET: 'test-refresh-0123456789abcdef0123456789abcdef',
      CORS_ORIGINS: 'http://localhost:4000',
    },
  },
});
