/**
 * Recorrido de humo por todas las pantallas privadas (claro y oscuro) con datos reales: cada una
 * abre sin errores de consola ni respuestas 4xx/5xx, con su título y sin textos técnicos.
 */
import { addWindow, api, expect, newQuoteFromUi, shot, signupApi, test, waitSaved } from './fixtures'
import type { Client, Quote } from '../packages/shared/src/api'

const PAGES: [string, RegExp][] = [
  ['/inicio', /Buen(os|as)/],
  ['/cotizaciones', /Cotizaciones/],
  ['/clientes', /Clientes/],
  ['/taller', /Taller|Producción/],
  ['/catalogo', /Catálogo/],
  ['/documentos', /Documentos|Diseños/],
  ['/ajustes/empresa', /Empresa/],
  ['/ajustes/precios', /Precios/],
  ['/ajustes/taller', /Taller/],
  ['/ajustes/plan', /Plan/],
]

const TECH = /undefined|NaN|\[object Object\]|null\b|Error:|TypeError|Sin dato|inválid/

test('todas las pantallas abren limpias (claro y oscuro)', async ({ page }) => {
  await signupApi(page, 'recorrido')
  const quoteId = await newQuoteFromUi(page)
  await addWindow(page, 'corredera', 1500, 1200)
  await waitSaved(page)
  const client = await api<Client>(page.request, 'POST', '/clients', { name: 'Constructora Los Aromos', rut: '76.086.428-5', phone: '+56 9 1234 5678' })
  await api<Quote>(page.request, 'GET', `/quotes/${quoteId}`)

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await page.evaluate((t) => localStorage.setItem('fz-theme', t), theme)
    for (const [path, heading] of [...PAGES, [`/clientes/${client.id}`, /Constructora Los Aromos/] as [string, RegExp], [`/cotizaciones/${quoteId}`, /./] as [string, RegExp]]) {
      await page.goto(path)
      await expect(page.getByRole('heading').filter({ hasText: heading }).first()).toBeVisible({ timeout: 15_000 })
      await page.waitForTimeout(400)
      const text = await page.locator('main, body').first().innerText()
      expect.soft(text.match(TECH)?.[0] ?? '', `sin textos técnicos en ${path}`).toBe('')
      await shot(page, `recorrido-${theme}${path.replace(/[/:]+/g, '-')}`)
    }
  }
})
