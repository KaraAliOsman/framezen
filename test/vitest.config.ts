import { defineConfig } from 'vitest/config'

// Pruebas del repositorio en sí (ignorados de git y Docker, documentación pública).
export default defineConfig({ test: { name: 'repo', environment: 'node', include: ['**/*.test.ts'] } })
