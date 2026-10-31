/**
 * Marco en modo local (sin IA): opera el editor con frases comunes en español de Chile y cada
 * cambio se ve en el editor y se puede deshacer.
 */
import { api, expect, footerTotal, itemRow, itemsList, newQuoteFromUi, pickerDialog, shot, signupApi, test, waitSaved } from './fixtures'
import type { Quote } from '../packages/shared/src/api'

test('Marco en modo local opera la cotización abierta', async ({ page }) => {
  await signupApi(page, 'marco')
  const status = await (await page.request.get('/api/assistant/status')).json().catch(() => ({}))
  test.info().annotations.push({ type: 'asistente', description: JSON.stringify(status).slice(0, 300) })

  const id = await newQuoteFromUi(page)
  if (await pickerDialog(page).isVisible().catch(() => false)) await page.keyboard.press('Escape')
  await expect(pickerDialog(page)).toBeHidden()

  // Abrir con Ctrl+J (o la cara de Marco en la barra superior).
  await page.locator('body').press('Control+j')
  const panel = page.getByRole('dialog', { name: 'Marco, tu asistente' }).or(page.getByRole('complementary', { name: 'Marco, tu asistente' })).or(page.locator('[aria-label="Marco, tu asistente"]')).first()
  if (!(await panel.isVisible({ timeout: 1500 }).catch(() => false))) await page.getByRole('button', { name: 'Abrir a Marco' }).click()
  await expect(panel).toBeVisible()
  const box = page.getByPlaceholder(/Pídeme algo/)
  await expect(box).toBeVisible()

  const say = async (text: string) => {
    await box.click()
    await box.fill(text)
    await box.press('Enter')
    await expect(page.getByRole('button', { name: 'Detener' })).toHaveCount(0, { timeout: 20_000 })
    await page.waitForTimeout(400)
  }

  await say('agrega una corredera de 1500 x 1200 blanca')
  await expect(itemsList(page).getByRole('button', { name: /^V\d+,/ })).toHaveCount(1)
  await expect(itemRow(page, 'V1')).toHaveAccessibleName(/Corredera.*1\.500 × 1\.200 mm/)
  await shot(page, 'marco-01-corredera')

  await say('duplica la V1')
  await expect(itemsList(page).getByRole('button', { name: /^V\d+,/ })).toHaveCount(2)

  const beforeDiscount = await footerTotal(page)
  await say('descuento 5 %')
  await expect(page.locator('footer[aria-label="Totales"]').getByLabel('Descuento en porcentaje')).toHaveValue(/^5/)
  const afterDiscount = await footerTotal(page)
  expect(afterDiscount).toBeLessThan(beforeDiscount)

  await say('cambia todo a nogal')
  await waitSaved(page)
  const saved = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(saved.items).toHaveLength(2)
  expect(saved.discountPct).toBe(5)
  for (const item of saved.items) expect(item.design.colorId).toBe('nogal')
  await shot(page, 'marco-02-nogal')

  // «deshacer» escrito revierte el último cambio de Marco.
  await say('deshacer')
  await waitSaved(page)
  const undone = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(undone.items.some((i) => i.design.colorId !== 'nogal')).toBe(true)

  // Lo que dijo Marco está en español, sin códigos ni errores.
  const log = await page.getByRole('log').first().innerText()
  expect(log).not.toMatch(/undefined|null|NaN|Error|\[object/)
  await shot(page, 'marco-03-deshacer')
})
