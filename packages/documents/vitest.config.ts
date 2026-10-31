import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { name: 'documents', include: ['test/**/*.test.ts?(x)', 'src/**/*.test.ts?(x)'] } })
