/**
 * Nunca bloquear y nunca perder datos: sin conexión el editor guarda al volver, los avisos no
 * tapan controles, ⌘K funciona y los enlaces rotos muestran una página humana.
 */
import { addWindow, api, expect, itemRow, newQuoteFromUi, saveStatus, shot, signupApi, test, waitSaved } from './fixtures'
import type { Quote } from '../packages/shared/src/api'

test('sin conexión: el cambio queda a salvo y se guarda al volver', async ({ page, context, allowProblems }) => {
  allowProblems(/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::ERR/)
  await signupApi(page, 'offline')
  const id = await newQuoteFromUi(page)
  await addWindow(page, 'fijo', 1000, 1000)
  await waitSaved(page)

  await context.setOffline(true)
  await page.locator('textarea[aria-label="Nombre de la obra"]').fill('Escrito sin conexión')
  await expect(saveStatus(page)).toContainText(/Sin conexión|No pudimos guardar/, { timeout: 15_000 })
  await shot(page, 'robustez-01-sin-conexion')
  // Se puede seguir trabajando sin conexión.
  await itemRow(page, 'V1').click()
  await page.locator('aside[aria-label="Inspector"]').getByRole('button', { name: 'Una más' }).first().click()

  await context.setOffline(false)
  await expect(page.getByRole('status').filter({ hasText: /^Guardado$/ }).first()).toBeVisible({ timeout: 40_000 })
  const saved = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(saved.title).toBe('Escrito sin conexión')
  expect(saved.items[0].qty).toBe(2)
})

test('los avisos del editor no tapan el selector Diseño | Documento', async ({ page }) => {
  await signupApi(page, 'avisos')
  await newQuoteFromUi(page)
  await addWindow(page, 'fijo', 1000, 1000)
  // Un aviso de dos líneas (crear cliente desde el combobox) y uno con «Deshacer» (Supr).
  await page.getByRole('button', { name: 'Cliente' }).or(page.getByRole('combobox', { name: 'Cliente' })).first().click()
  await page.getByPlaceholder('Busca o escribe un nombre…').fill('Constructora Los Aromos Limitada')
  await page.getByRole('option', { name: /Crear cliente/ }).click()
  await expect(page.getByText(/Creaste a Constructora/)).toBeVisible()
  await page.waitForTimeout(700) // la entrada del aviso terminó
  const docRadio = page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Documento' })
  const overlap = await page.evaluate(() => {
    const toast = document.querySelector('[data-sonner-toast]') as HTMLElement | null
    const radio = [...document.querySelectorAll('[role="radio"]')].find((r) => r.textContent?.includes('Documento')) as HTMLElement | undefined
    if (!toast || !radio) return null
    const a = toast.getBoundingClientRect()
    const b = radio.getBoundingClientRect()
    return { toast: [a.left, a.top, a.right, a.bottom].map(Math.round), radio: [b.left, b.top, b.right, b.bottom].map(Math.round), overlaps: !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom) }
  })
  test.info().annotations.push({ type: 'aviso-vs-documento', description: JSON.stringify(overlap) })
  await shot(page, 'robustez-02-aviso-tapa')
  const clickable = await docRadio.click({ trial: true, timeout: 1500 }).then(() => true, () => false)
  expect.soft(overlap?.overlaps ?? false, 'el aviso no debería quedar encima del selector Diseño | Documento').toBe(false)
  expect.soft(clickable, 'el selector Diseño | Documento se puede pulsar mientras se ve el aviso').toBe(true)
})

test('⌘K, página no encontrada y enlace de portal roto', async ({ page, allowProblems }) => {
  allowProblems(/http 404 GET \/api\/public\/quotes\//)
  await signupApi(page, 'cmdk')
  await page.goto('/inicio')
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await page.locator('body').press('Control+k')
  const palette = page.getByRole('dialog').filter({ has: page.getByRole('combobox') }).first()
  await expect(palette).toBeVisible()
  await page.keyboard.type('catálogo')
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/catalogo/)

  await page.goto('/esto-no-existe')
  await expect(page.getByText('No encontramos esta página')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/404 Not Found|Unexpected Application Error|Cannot GET/)
  await shot(page, 'robustez-03-no-encontrada')

  await page.goto('/c/token-que-no-existe')
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('body')).not.toContainText(/not_found|Error:|undefined/)
  await shot(page, 'robustez-04-portal-roto')
})
