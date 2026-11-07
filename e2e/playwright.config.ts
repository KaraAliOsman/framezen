/**
 * Suite E2E de DEKOPEN (Playwright). No levanta servidores: espera la web de Vite en
 * http://localhost:5180 (proxy /api → 8787) ya corriendo (`npm run dev`).
 *
 *   npx playwright test -c e2e                 # todo
 *   npx playwright test -c e2e cotizacion      # un archivo
 *   FZ_BASE=http://localhost:5197 npx playwright test -c e2e
 *
 * Cada prueba crea su propia cuenta con un correo único: se puede correr en paralelo y repetir
 * sin limpiar la base. Los errores de consola y las respuestas 4xx/5xx inesperadas de /api se
 * registran en cada prueba (anotaciones + adjunto «problemas.json») y fallan como `expect.soft`.
 */
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.FZ_BASE ?? 'http://localhost:5180'

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  outputDir: '../test-results/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // El servidor de desarrollo usa PGlite (una sola conexión): dos o tres trabajadores bastan.
  workers: process.env.CI ? 1 : 2,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: '../playwright-report/e2e', open: 'never' }]],
  use: {
    baseURL,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'escritorio',
      testIgnore: /movil\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'movil',
      testMatch: /movil\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
