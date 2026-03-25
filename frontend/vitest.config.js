import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-utils.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/test-utils.js', 'src/main.jsx'],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 99,
        statements: 100,
      },
    },
  },
})
