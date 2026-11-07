import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { name: 'documents', testTimeout: 20000, include: ['test/**/*.test.ts?(x)', 'src/**/*.test.ts?(x)'] } })
