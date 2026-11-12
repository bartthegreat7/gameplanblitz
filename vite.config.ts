/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Project Pages site: https://bartthegreat7.github.io/gameplanblitz/
export default defineConfig({
  base: '/gameplanblitz/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // page-level tests render the whole app and load lazy chunks; under a full parallel run they need more than the 5s default
    testTimeout: 30_000,
  },
})
