import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Issue 23 requires the app to run on port 3000 (the backend uses 8000).
    port: 3000,
    // Fail loudly instead of silently hopping to another port — the acceptance
    // criterion is "app runs on 3000", so a busy port should be surfaced.
    strictPort: true,
  },
})
