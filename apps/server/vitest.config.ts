import { defineConfig } from 'vitest/config'
// beforeAll arranca PGlite con migraciones (y afterAll cierra Chromium): con la suite completa en
// paralelo puede pasar de los 10 s por defecto, así que los hooks tienen el mismo plazo que las pruebas.
export default defineConfig({ test: { name: 'server', include: ['test/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000 } })
