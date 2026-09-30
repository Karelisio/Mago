/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    // vitrine/ est un projet autonome, avec ses propres dépendances et tests.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
