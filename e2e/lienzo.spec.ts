/**
 * Edición directa en el lienzo: cota editable con clic, dividir un paño, arrastrar el montante
 * con imán, cambiar la apertura desde la barra contextual, deshacer y persistencia tras recargar.
 */
import { addWindow, api, expect, itemRow, newQuoteFromUi, shot, signupApi, test, waitSaved } from './fixtures'
import type { Quote } from '../packages/shared/src/api'

test('lienzo: cota, dividir, arrastrar montante, apertura y deshacer', async ({ page }) => {
  await signupApi(page, 'lienzo')
  const id = await newQuoteFromUi(page)
  await addWindow(page, 'fijo', 1200, 1000)
  const canvas = page.locator('[data-quote-canvas]')
  await expect(canvas).toBeVisible()

  // 1) Cota editable en el lugar: clic en «1.200», escribir 1500, Enter.
  await canvas.getByRole('button', { name: 'Editar medida de 1.200 mm' }).first().click()
  const dimInput = canvas.locator('input[inputmode="decimal"]').first()
  await expect(dimInput).toBeVisible()
  await expect(dimInput).toBeFocused()
  await dimInput.fill('1500')
  await dimInput.press('Enter')
  await expect(itemRow(page, 'V1')).toHaveAccessibleName(/1\.500 × 1\.000 mm/)
  await expect(canvas.getByRole('button', { name: 'Editar medida de 1.500 mm' }).first()).toBeVisible()

  // Una medida imposible no bloquea: se acepta con aviso en lenguaje de taller y se deshace con Ctrl+Z.
  await canvas.getByRole('button', { name: 'Editar medida de 1.000 mm' }).first().click()
  await dimInput.fill('20')
  await dimInput.press('Enter')
  await expect(itemRow(page, 'V1')).toHaveAccessibleName(/1\.500 × 20 mm/)
  await expect(page.locator('[title^="Tiene avisos"]').first()).toBeVisible()
  await shot(page, 'lienzo-01-medida-imposible')
  await page.locator('body').press('Control+z')
  await expect(itemRow(page, 'V1')).toHaveAccessibleName(/1\.500 × 1\.000 mm/)

  // 2) Clic en el paño → barra contextual → dividir vertical en 2.
  const box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const toolbar = page.getByRole('toolbar', { name: 'Opciones del paño' }).or(page.locator('[aria-label="Opciones del paño"]')).first()
  await expect(toolbar).toBeVisible()
  await shot(page, 'lienzo-02-barra-contextual')
  await page.keyboard.press('v')
  const mullion = canvas.getByRole('slider').first()
  await expect(mullion).toBeVisible()
  const before = await mullion.getAttribute('aria-valuetext')
  expect(before).toMatch(/mm/)

  // 3) Arrastrar el montante hacia la derecha (imán a 10/50 mm).
  const mb = (await mullion.boundingBox())!
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(mb.x + mb.width / 2 + i * 6, mb.y + mb.height / 2)
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
  const after = await mullion.getAttribute('aria-valuetext')
  expect(after).not.toBe(before)
  const leftMm = Number((after ?? '').match(/^([\d.,]+)/)?.[1].replace(/\./g, '').replace(',', '.'))
  expect(leftMm % 10, `el imán deja el montante en múltiplos de 10 mm (${after})`).toBe(0)
  await shot(page, 'lienzo-03-montante')

  // 4) Elegir el paño izquierdo y darle apertura abatible desde la barra.
  const mb2 = (await mullion.boundingBox())!
  await page.mouse.click(box.x + (mb2.x - box.x) / 2, box.y + box.height / 2)
  await expect(toolbar).toBeVisible()
  const opening = page.getByRole('group', { name: 'Apertura' }).first()
  await opening.getByRole('button', { name: /Abatible|Abatir/ }).first().click()
  await expect(itemRow(page, 'V1')).not.toHaveAccessibleName(/Paño fijo/)
  const named = await itemRow(page, 'V1').getAttribute('aria-label')
  await shot(page, 'lienzo-04-apertura')

  // 5) Ctrl+Z deshace la apertura; Ctrl+Shift+Z la rehace.
  await page.keyboard.press('Escape')
  await page.locator('body').press('Control+z')
  await expect(itemRow(page, 'V1')).not.toHaveAccessibleName(named!)
  await page.locator('body').press('Control+Shift+z')
  await expect(itemRow(page, 'V1')).toHaveAccessibleName(named!)

  // 6) Se guarda solo y sobrevive a la recarga.
  await waitSaved(page)
  const saved = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(saved.items[0].design.width).toBe(1500)
  expect(JSON.stringify(saved.items[0].design.root)).toMatch(/"split"/)
  await page.reload()
  await expect(itemRow(page, 'V1')).toHaveAccessibleName(named!)
  await expect(page.locator('[data-quote-canvas]').getByRole('slider').first()).toHaveAttribute('aria-valuetext', after!)
})
