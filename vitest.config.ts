import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    // Each test file gets its own in-memory MongoDB; run files serially to keep memory low.
    fileParallelism: false,
    // The first run downloads a mongod binary.
    hookTimeout: 180_000,
    testTimeout: 30_000,
    // Set before env.config.ts loads; dotenv never overrides existing vars,
    // so tests can never pick up the real database from config.env.
    env: {
      NODE_ENV: 'test',
      PORT: '0',
      LOG_LEVEL: 'fatal',
      DATABASE_URL: 'mongodb://127.0.0.1:1/unused-in-tests',
      DATABASE_PASSWORD: 'unused',
      JWT_SECRET: 'test-secret-do-not-use-in-production',
      JWT_EXPIRES_IN: '3600',
      EMAIL_FROM: 'test@promptpal.local',
      CORS_ORIGIN: 'http://localhost:5173',
      CLIENT_URL: 'http://localhost:5173',
      GOOGLE_AI_API_KEY: '',
      GROQ_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      AI_PROVIDER: 'auto',
      CLOUDINARY_CLOUD_NAME: '',
    },
  },
});
