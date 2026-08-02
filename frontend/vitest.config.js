import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.js so the dev/build server config stays
// minimal and test-only options never leak into the app bundle.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
})
