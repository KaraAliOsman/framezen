/**
 * Edición directa sobre la hoja: escribir en el lugar, ocultar un dato con un clic, arrastrar una
 * sección, deshacer, y comprobar que el PDF del servidor sale igual a lo editado. Lo cambiado queda solo
 * en la cotización hasta que se decide llevarlo a una plantilla.
 */
import { addWindow, api, expect, newQuoteFromUi, signupApi, test, waitSaved } from './fixtures'
import type { Quote } from '../packages/shared/src/api'

test('la hoja se edita directo y el PDF sale igual', async ({ page }) => {
  await signupApi(page, 'lienzo')
  await api(page.request, 'PATCH', '/settings', { documents: { warranty: 'Cinco años en perfiles.', conditions: 'Precios en pesos.' } })
  const id = await newQuoteFromUi(page)
  await addWindow(page, 'corredera', 1500, 1200)
  await addWindow(page, 'abatible', 600, 900)
  await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Documento' }).click()
  const sheet = page.locator('[data-doc-canvas]')
  await expect(sheet.locator('[data-dk-page]').first()).toBeVisible()

  // Clic en el texto y se escribe ahí mismo.
  const warranty = sheet.locator('[contenteditable][data-field="warranty"]').first()
  await warranty.scrollIntoViewIfNeeded()
  await warranty.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Garantía escrita en la hoja.')
  await warranty.evaluate((el) => (el as HTMLElement).blur())
  await expect(sheet).toContainText('Garantía escrita en la hoja.')

  // Un clic sobre el elemento lo oculta.
  await sheet.locator('[data-dk-el="drawing"]').first().hover()
  await page.getByRole('button', { name: 'Ocultar Dibujo de la ventana' }).click()
  await expect(sheet.locator('[data-dk-el="drawing"]')).toHaveCount(0)
  await sheet.locator('[data-dk-el="showGlassImage"]').first().hover()
  await page.getByRole('button', { name: 'Ocultar Imagen del vidrio' }).click()
  await expect(sheet.locator('[data-dk-el="showGlassImage"]')).toHaveCount(0)

  // Deshacer y rehacer pasan por el historial de la cotización.
  await page.keyboard.press('Control+z')
  await expect(sheet.locator('[data-dk-el="showGlassImage"]').first()).toBeVisible()
  await page.keyboard.press('Control+Shift+z')
  await expect(sheet.locator('[data-dk-el="showGlassImage"]')).toHaveCount(0)

  // Barra flotante: el dibujo vuelve desde ahí.
  await sheet.locator('.dkd-sec--items').first().click({ position: { x: 240, y: 6 } })
  const bar = page.locator('[data-selection-bar]')
  await expect(bar).toBeVisible()
  await bar.getByRole('combobox', { name: 'Tamaño del dibujo' }).click()
  await page.getByRole('option', { name: 'Chico' }).click()
  await expect(sheet.locator('[data-dk-el="drawing"]').first()).toBeVisible()
  await bar.getByRole('combobox', { name: 'Tamaño del dibujo' }).click()
  await page.getByRole('option', { name: 'Sin dibujo' }).click()
  await expect(sheet.locator('[data-dk-el="drawing"]')).toHaveCount(0)

  // Arrastrar una sección.
  const order = () => sheet.locator('[data-dk-block]').evaluateAll((nodes) => [...new Set(nodes.map((n) => n.getAttribute('data-dk-section')))])
  const before = await order()
  const grip = await bar.getByRole('button', { name: 'Arrastrar para mover' }).boundingBox()
  const strip = await sheet.locator('.dkd-sec--client_strip').first().boundingBox()
  await page.mouse.move(grip!.x + 8, grip!.y + 8)
  await page.mouse.down()
  await page.mouse.move(strip!.x + 80, strip!.y + 3, { steps: 8 })
  await page.mouse.up()
  await expect.poll(order).not.toEqual(before)

  await waitSaved(page)
  const saved = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(saved.documentOverrides).toMatchObject({ itemDisplay: { drawingSize: 'none', showGlassImage: false }, texts: { warranty: 'Garantía escrita en la hoja.' } })

  // El PDF del servidor imprime lo mismo que la vista final.
  await page.getByRole('button', { name: 'Vista final' }).click()
  await expect(sheet.locator('[contenteditable]')).toHaveCount(0)
  const html = await (await page.request.get(`/api/quotes/${id}/pdf?format=html`)).text()
  expect(html).toContain('Garantía escrita en la hoja.')
  expect(html).not.toContain('data-dk-el="drawing"')
  expect(html).not.toContain('data-dk-el="showGlassImage"')
  const pages = await sheet.locator('[data-dk-page]').count()
  expect((html.match(/data-dk-page=/g) ?? []).length).toBeLessThanOrEqual(pages + 1)
})

test('lo cambiado en una cotización se puede llevar a una plantilla', async ({ page }) => {
  await signupApi(page, 'lienzo-plantilla')
  const id = await newQuoteFromUi(page)
  await addWindow(page, 'corredera', 1500, 1200)
  await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Documento' }).click()
  const sheet = page.locator('[data-doc-canvas]')
  await sheet.locator('[data-dk-el="showSystem"]').first().hover()
  await page.getByRole('button', { name: 'Ocultar Especificaciones' }).click()
  await waitSaved(page)
  await page.getByRole('button', { name: 'Guardar como plantilla nueva' }).click()
  await expect(page.getByText(/Creamos la plantilla/)).toBeVisible()
  await waitSaved(page)
  const saved = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  const overrides = saved.documentOverrides as { templateId?: string; itemDisplay?: unknown }
  expect(overrides.templateId).toBeTruthy()
  expect(overrides.itemDisplay).toBeUndefined()
  await page.goto(`/documentos?plantilla=${overrides.templateId}`)
  await expect(page.locator(`[data-template-id="${overrides.templateId}"]`)).toBeVisible()
})
