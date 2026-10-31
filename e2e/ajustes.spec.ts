/**
 * Ajustes: datos de la empresa con logo (se guardan solos y salen en el documento) y precios
 * (margen y mano de obra) con su efecto en el precio de una cotización.
 */
import { addWindow, api, expect, footerTotal, newQuoteFromUi, shot, signupApi, test, waitEditorReady } from './fixtures'
import type { Org, OrgSettings, Quote } from '../packages/shared/src/api'

test('empresa con logo y precios: se guardan solos y cambian el precio', async ({ page }) => {
  await signupApi(page, 'ajustes')
  const quoteId = await newQuoteFromUi(page)
  await addWindow(page, 'fijo', 1500, 1200)
  await page.locator('textarea[aria-label="Nombre de la obra"]').fill('Obra ajustes')
  const totalBefore = await footerTotal(page)
  await page.waitForTimeout(1500)
  // Una copia enviada al cliente antes de cambiar los precios (versión A).
  const sentCopy = await api<Quote>(page.request, 'POST', `/quotes/${quoteId}/duplicate`)
  const sent = await api<{ url: string; quote: Quote }>(page.request, 'POST', `/quotes/${sentCopy.id}/send`, { channel: 'link' })
  const sentToken = new URL(sent.url).pathname.split('/').pop()!

  // ── Empresa ──
  await page.goto('/ajustes/empresa')
  await expect(page.getByRole('heading', { name: 'Empresa' }).first()).toBeVisible()
  await page.getByLabel('Razón social').fill('Ventanas Martínez SpA')
  await page.getByLabel('RUT de la empresa').fill('76086428-5')
  await page.getByLabel('Teléfono').fill('+56 9 8765 4321')
  await page.getByLabel('Ciudad').fill('Concepción')

  // Logo: un PNG generado en el navegador (120 × 40, letras sobre fondo de color).
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 240
    c.height = 80
    const g = c.getContext('2d')!
    g.fillStyle = '#1F3AA0'
    g.fillRect(0, 0, 240, 80)
    g.fillStyle = '#fff'
    g.font = 'bold 40px sans-serif'
    g.fillText('VM', 20, 55)
    return c.toDataURL('image/png').split(',')[1]
  })
  await page.locator('input[type="file"][accept*="image"]').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  // Puede abrirse un recorte opcional: se acepta tal cual.
  const crop = page.getByRole('dialog')
  if (await crop.isVisible({ timeout: 2000 }).catch(() => false)) {
    await shot(page, 'ajustes-01-recorte-logo')
    await crop.getByRole('button', { name: /Usar|Listo|Guardar|Aplicar/ }).last().click()
  }
  await expect(page.getByRole('button', { name: 'Cambiar' }).first()).toBeVisible()
  await expect.poll(async () => (await api<Org>(page.request, 'GET', '/org')).logo ?? '', { timeout: 15_000 }).toMatch(/^data:image\//)
  await shot(page, 'ajustes-02-empresa')

  const org = await api<Org>(page.request, 'GET', '/org')
  expect(org.legalName).toBe('Ventanas Martínez SpA')
  expect(org.rut).toBe('76.086.428-5')
  expect(org.city).toBe('Concepción')

  // Recargar: todo sigue ahí.
  await page.reload()
  await expect(page.getByLabel('Razón social')).toHaveValue('Ventanas Martínez SpA')
  await expect(page.getByLabel('RUT de la empresa')).toHaveValue('76.086.428-5')

  // RUT con dígito verificador malo: aviso, nunca bloqueo.
  await page.getByLabel('RUT de la empresa').fill('76086428-9')
  await page.getByLabel('Ciudad').click()
  await expect(page.getByText(/dígito|verificador|revisa el RUT|no calza|parece/i).first()).toBeVisible()
  await page.getByLabel('RUT de la empresa').fill('76086428-5')

  // ── Precios ──
  await page.goto('/ajustes/precios')
  await expect(page.getByRole('heading', { name: 'Precios' }).first()).toBeVisible()
  const margin = page.locator('#pricing-margin')
  await margin.fill('30')
  await margin.press('Tab')
  const labor = page.locator('#pricing-labor')
  await labor.fill('8000')
  await labor.press('Tab')
  await expect.poll(async () => (await api<OrgSettings>(page.request, 'GET', '/settings')).pricing.marginPct, { timeout: 15_000 }).toBe(30)
  await expect.poll(async () => (await api<OrgSettings>(page.request, 'GET', '/settings')).pricing.laborPerM2, { timeout: 15_000 }).toBe(8000)
  await shot(page, 'ajustes-03-precios', { fullPage: true })
  await page.reload()
  await expect(page.locator('#pricing-margin')).toHaveValue(/^30/)

  // ── Efecto en la cotización: menos margen y mano de obra → precio más bajo ──
  await page.goto(`/cotizaciones/${quoteId}`)
  await waitEditorReady(page)
  const totalAfter = await footerTotal(page)
  test.info().annotations.push({ type: 'precio', description: `margen 40 %→30 %, mano de obra 12.000→8.000: ${totalBefore} → ${totalAfter}` })
  expect(totalAfter).toBeLessThan(totalBefore)
  await page.waitForTimeout(1500)
  const saved = await api<Quote>(page.request, 'GET', `/quotes/${quoteId}`)
  expect.soft(saved.totals?.total, 'el total guardado (lista, Inicio, estadísticas) se actualiza con los nuevos ajustes').toBe(totalAfter)
  await page.goto('/cotizaciones')
  const listRow = page.getByRole('row').filter({ hasText: 'Obra ajustes' }).filter({ hasNotText: 'copia' }).first()
  await expect(listRow).toBeVisible()
  const listLabel = (await listRow.innerText()).replace(/\s+/g, ' ')
  test.info().annotations.push({ type: 'lista', description: `lista: ${listLabel} · editor: ${totalAfter}` })
  expect.soft(listLabel, 'la lista muestra el mismo total que el editor').toContain(new Intl.NumberFormat('es-CL').format(totalAfter))

  // La copia ya enviada: lo que ve el taller en el editor vs. lo que ve el cliente.
  await page.goto(`/cotizaciones/${sentCopy.id}`)
  await waitEditorReady(page)
  const editorSent = await footerTotal(page)
  const pub = await (await page.request.get(`/api/public/quotes/${sentToken}`)).json()
  await page.getByRole('button', { name: 'Enviar al cliente' }).click()
  const sendDialog = page.getByRole('dialog', { name: 'Enviar al cliente' })
  // Listo («Enlace del cliente») o, si solo cambiaron tus precios, la confirmación de la versión
  // siguiente con el enlace vigente («Enlace actual del cliente»).
  await expect(sendDialog.getByLabel(/^Enlace (actual )?del cliente$/)).toBeVisible({ timeout: 20_000 })
  const description = await sendDialog.innerText()
  await shot(page, 'ajustes-05-enviada-tras-cambiar-precios')
  test.info().annotations.push({ type: 'enviada', description: `editor ${editorSent} · cliente ${pub.quote.totals?.total} · diálogo: ${description.split(/\n/).slice(0, 3).join(' | ')}` })
  if (editorSent !== pub.quote.totals?.total) {
    expect.soft(description, 'si el total del editor ya no es el que vio el cliente, «Enviar» debería ofrecer la versión nueva (no decir «no hay cambios»)').not.toMatch(/no hay cambios/)
  }
  await page.keyboard.press('Escape')
  await page.goto(`/cotizaciones/${quoteId}`)
  await waitEditorReady(page)

  // El documento de la cotización lleva el logo y la razón social.
  await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Documento' }).click()
  const preview = page.locator('section[aria-label="Documento para el cliente"]')
  await expect(preview.locator('img[src^="data:image"]').first()).toBeVisible()
  await expect(preview).toContainText('Ventanas Martínez SpA')
  await shot(page, 'ajustes-04-documento-con-logo')
})
