/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate from vite.config.ts so the dev-server proxy doesn't affect tests.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // jsdom's localStorage is unavailable under the default "about:blank"
    // origin (opaque origin) — a real http(s) URL is required for it to
    // work, which shared/api/http.ts and shared/theme/themeManager.ts rely on.
    environmentOptions: {
      jsdom: { url: 'http://localhost/' }
    },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}']
  }
});
