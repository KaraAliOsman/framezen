/**
 * Teléfono 390 × 844: editor (lista + hojas inferiores) y portal del cliente con aceptación.
 * Revisa que no haya desplazamiento horizontal, que los campos de medidas no hagan zoom en iOS
 * (≥ 16 px) y que las acciones principales se alcancen con el pulgar.
 */
import { expect, itemsList, newQuoteFromUi, pickerDialog, shot, signupApi, test, type Page } from './fixtures'

async function noHorizontalScroll(page: Page, where: string) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }))
  expect.soft(scroll, `sin desplazamiento horizontal en ${where} (${scroll} px > ${width} px)`).toBeLessThanOrEqual(width + 1)
}

async function addWindowMobile(page: Page, search: string, w: number, h: number) {
  const picker = pickerDialog(page)
  if (!(await picker.isVisible().catch(() => false))) await page.getByRole('button', { name: 'Agregar ventana' }).first().tap()
  await expect(picker).toBeVisible()
  await picker.getByLabel('Buscar tipología').fill(search)
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog').filter({ has: page.getByLabel('Ancho', { exact: true }) })
  const width = dialog.getByLabel('Ancho', { exact: true })
  await expect(width).toBeVisible()
  const fontSize = await width.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect.soft(fontSize, 'el campo Ancho mide ≥ 16 px para que iOS no haga zoom').toBeGreaterThanOrEqual(16)
  await width.fill(String(w))
  await dialog.getByLabel('Alto', { exact: true }).fill(String(h))
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
}

test('editor en el teléfono: agregar, hoja de la ventana, totales y enviar', async ({ page, browser, watch }) => {
  await signupApi(page, 'movil')
  await newQuoteFromUi(page)
  await shot(page, 'movil-01-galeria')
  await addWindowMobile(page, 'corredera', 1800, 1200)
  await addWindowMobile(page, 'puerta', 900, 2100)
  await expect(itemsList(page).getByRole('button', { name: /^V\d+,/ })).toHaveCount(2)
  await noHorizontalScroll(page, 'el editor')
  await shot(page, 'movil-02-lista')

  // Hoja de la ventana: dibujo, cantidad y cerrar.
  await itemsList(page).getByRole('button', { name: /^V1,/ }).tap({ position: { x: 40, y: 30 } })
  const sheet = page.getByRole('dialog').filter({ hasText: 'V1' }).first()
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('svg').first()).toBeVisible()
  await sheet.getByRole('button', { name: 'Una más' }).first().tap()
  await expect(sheet.getByRole('group', { name: 'Cantidad de V1' }).locator('input')).toHaveValue('2')
  await shot(page, 'movil-03-hoja-ventana')
  await shot(page, 'movil-03b-hoja-ventana-completa', { fullPage: true })
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(itemsList(page).getByRole('button', { name: /^V1,/ })).toHaveAccessibleName(/2 unidades/)

  // Totales y acciones.
  await page.getByRole('button', { name: 'Ver totales' }).tap()
  const totals = page.getByRole('dialog', { name: 'Totales' })
  await expect(totals).toBeVisible()
  await expect(totals.getByRole('button', { name: /taller/i })).toBeVisible()
  await shot(page, 'movil-04-totales')
  await page.keyboard.press('Escape')

  // Enviar desde la barra inferior.
  const send = page.getByRole('button', { name: 'Enviar', exact: true })
  const box = (await send.boundingBox())!
  expect.soft(box.height, 'el botón Enviar mide ≥ 44 px de alto').toBeGreaterThanOrEqual(44)
  await send.tap()
  const dialog = page.getByRole('dialog', { name: 'Enviar al cliente' })
  await expect(dialog.getByLabel('Enlace del cliente')).toHaveValue(/\/c\//, { timeout: 20_000 })
  const link = await dialog.getByLabel('Enlace del cliente').inputValue()
  await noHorizontalScroll(page, 'el diálogo de envío')
  await shot(page, 'movil-05-enviar')

  // Portal del cliente en su teléfono (sin sesión).
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'es-CL' })
  const portal = await ctx.newPage()
  watch(portal, 'portal-movil')
  await portal.goto(new URL(link).pathname)
  await expect(portal.getByRole('heading', { level: 1 })).toBeVisible()
  // La obra nunca se nombró: el cliente no debería ver un texto de relleno interno como título.
  await expect.soft(portal.getByRole('heading', { level: 1 }), 'sin nombre de obra, el portal muestra «Cotización N° …», no «Nueva obra»').not.toHaveText('Nueva obra')
  await noHorizontalScroll(portal, 'el portal')
  await shot(portal, 'movil-06-portal')
  await shot(portal, 'movil-07-portal-completo', { fullPage: true })
  const accept = portal.getByRole('button', { name: 'Aceptar', exact: true })
  await expect(accept).toBeInViewport()
  await accept.tap()
  const acceptSheet = portal.getByRole('dialog', { name: 'Aceptar cotización' })
  await expect(acceptSheet).toBeVisible()
  await acceptSheet.getByLabel('Tu nombre').fill('María José Fuentes')
  await shot(portal, 'movil-08-aceptar')
  await acceptSheet.getByRole('button', { name: 'Acepto la cotización' }).tap()
  await expect(portal.getByRole('dialog', { name: 'Cotización aceptada' })).toBeVisible()
  await shot(portal, 'movil-09-aceptada')
  await ctx.close()
})
