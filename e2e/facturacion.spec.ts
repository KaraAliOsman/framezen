/**
 * Facturación en modo dev (sin claves de Flow): elegir plan lo activa al instante, subir de plan
 * rige ahora, bajar se programa para el fin del período, y todo queda en el historial.
 */
import { api, expect, shot, signupApi, test } from './fixtures'
import type { BillingStateDetail } from '../packages/shared/src/api'

test('cambiar de plan en modo dev', async ({ page }) => {
  await signupApi(page, 'facturacion')
  let billing = await api<BillingStateDetail>(page.request, 'GET', '/billing')
  expect(billing.plan).toBe('trial')
  test.skip(billing.provider !== 'dev', 'El servidor tiene Flow configurado: esta prueba es para el modo dev.')

  await page.goto('/ajustes/plan')
  await expect(page.getByRole('heading', { name: 'Plan y facturación' })).toBeVisible()
  await expect(page.getByText('Modo de prueba: el cambio de plan se activa al instante, sin cobro.')).toBeVisible()
  await shot(page, 'plan-01-prueba', { fullPage: true })

  // Mensual → elegir Pro: queda activo al instante.
  await page.getByRole('radiogroup', { name: 'Forma de pago' }).getByRole('radio', { name: 'Mensual' }).click()
  await page.getByRole('button', { name: 'Elegir Pro' }).click()
  await expect(page.getByText(/Listo/).first()).toBeVisible()
  await expect.poll(async () => (await api<BillingStateDetail>(page.request, 'GET', '/billing')).plan).toBe('pro')
  billing = await api<BillingStateDetail>(page.request, 'GET', '/billing')
  expect(billing.status).toBe('active')
  expect(billing.period).toBe('monthly')
  await expect(page.getByText('Tu plan actual')).toBeVisible()
  await shot(page, 'plan-02-pro')

  // Subir a Empresa: rige ahora (prorrateo con saldo a favor).
  await page.getByRole('button', { name: 'Cambiar a Empresa', exact: true }).click()
  await expect.poll(async () => (await api<BillingStateDetail>(page.request, 'GET', '/billing')).plan).toBe('empresa')
  billing = await api<BillingStateDetail>(page.request, 'GET', '/billing')
  expect(billing.features).toContain('roles')

  // Bajar a Taller: se programa para el fin del período, sin perder nada hoy.
  await page.getByRole('button', { name: 'Cambiar a Taller' }).click()
  await expect(page.getByText(/pasas a Taller|cambio a Taller|Taller desde/).first()).toBeVisible()
  billing = await api<BillingStateDetail>(page.request, 'GET', '/billing')
  expect(billing.plan).toBe('empresa')
  expect(billing.pendingChange?.plan).toBe('taller')
  await shot(page, 'plan-03-baja-programada', { fullPage: true })

  // Tras recargar (el aviso ya se fue) la pantalla debe seguir diciendo que hay un cambio programado.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Plan y facturación' })).toBeVisible()
  await page.waitForTimeout(800)
  const planText = await page.locator('main').innerText()
  expect.soft(planText, 'la baja programada a Taller se ve en la pantalla de plan (no solo en un aviso de 5 s)').toMatch(/programad|pasas a Taller|cambia a Taller|desde el \d+ de \w+/i)
  // «Cambias o cancelas cuando quieras»: debe existir la forma de cancelar (POST /api/billing/cancel existe).
  await expect.soft(page.getByRole('button', { name: /Cancelar (el )?(plan|suscripción)|No renovar/i }), 'hay un botón para cancelar la suscripción').toHaveCount(1)

  // Historial con los movimientos.
  const history = await api<{ items: unknown[]; total: number }>(page.request, 'GET', '/billing/history')
  expect(history.total).toBeGreaterThanOrEqual(3)
  await expect(page.locator('#billing-history')).toBeVisible()

  // El menú de la cuenta muestra el plan vigente.
  await page.getByRole('button', { name: /^Cuenta de / }).click()
  await expect(page.getByRole('menu').getByText('Empresa').first()).toBeVisible()
  await page.keyboard.press('Escape')
})
