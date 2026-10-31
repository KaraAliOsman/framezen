import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: { name: 'web', environment: 'jsdom', include: ['src/**/*.test.ts?(x)', 'test/**/*.test.ts?(x)'] },
} as never)
