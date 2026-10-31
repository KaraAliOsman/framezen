/**
 * Pasar a taller y documentos de taller: «Pasar a taller» nunca exige aceptación, crea la OT con
 * cortes/vidrios/materiales calculados, cada pestaña se dibuja, el avance por estación se guarda,
 * los PDF de taller salen del servidor y respetan las opciones elegidas en pantalla.
 */
import { addWindow, api, expect, newQuoteFromUi, shot, signupApi, test, waitSaved } from './fixtures'
import type { Quote, WorkOrder } from '../packages/shared/src/api'

/** Lee el tamaño de la primera página de un PDF (MediaBox en puntos). */
function mediaBox(pdf: Buffer): [number, number] | null {
  const m = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/)
  return m ? [Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])] : null
}

test('pasar a taller, pestañas de la OT, avance y PDF de taller', async ({ page }) => {
  await signupApi(page, 'taller')
  const quoteId = await newQuoteFromUi(page)
  await addWindow(page, 'corredera', 1800, 1200)
  await addWindow(page, 'oscilobatiente', 700, 1100)
  await addWindow(page, 'puerta', 900, 2100)
  await page.locator('textarea[aria-label="Nombre de la obra"]').fill('Obra taller · Los Ángeles')
  await waitSaved(page)

  // Directo desde borrador (nada obligatorio): crea la OT y abre su página.
  await page.getByRole('button', { name: 'Pasar a taller' }).click()
  await page.waitForURL(/\/taller\/[^/]+$/, { timeout: 20_000 })
  await expect(page.getByText(/Creamos la OT N° \d+/)).toBeVisible()
  const orderId = new URL(page.url()).pathname.split('/').pop()!
  await expect(page.getByRole('heading', { name: /OT N° \d+/ }).first()).toBeVisible()
  await shot(page, 'taller-01-resumen')

  const q = await api<Quote>(page.request, 'GET', `/quotes/${quoteId}`)
  expect(q.status).toBe('workshop')

  // Avance por estación (Resumen): V1 a «Soldadura» o la siguiente estación disponible.
  const station = page.getByRole('combobox', { name: 'Estación de la V1' }).first()
  await station.click()
  const options = page.getByRole('option')
  await expect(options.first()).toBeVisible()
  const optionCount = await options.count()
  expect(optionCount).toBeGreaterThan(3)
  const secondLabel = (await options.nth(1).innerText()).trim()
  await options.nth(1).click()
  await expect(station).toContainText(secondLabel)
  await page.waitForTimeout(1200)
  const order = await api<WorkOrder>(page.request, 'GET', `/work-orders/${orderId}`)
  expect(order.progress['V1']).toBeTruthy()
  expect(order.progress['V1']).not.toBe('cut')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Estación de la V1' }).first()).toContainText(secondLabel)

  // Cada pestaña de documentos se dibuja con su vista previa.
  const tabs: [string, RegExp][] = [
    ['Cortes', /barra|Barra/],
    ['Vidrios', /vidrio|Vidrio/],
    ['Materiales', /Material|material|Perfil/],
    ['Montaje', /Montaje|montaje/],
    ['Etiquetas', /etiqueta/i],
    ['Compras', /compra|Compra/],
    ['CNC', /CSV|sierra|corte/i],
  ]
  for (const [name, expected] of tabs) {
    await page.getByRole('tab', { name: new RegExp(`^${name}`) }).first().click()
    const panel = page.getByRole('tabpanel', { name })
    await expect(panel).toBeVisible()
    await expect(panel).toContainText(expected)
    await expect(panel.getByText(/No pudimos/)).toHaveCount(0)
    await shot(page, `taller-02-${name.toLowerCase()}`)
  }

  // PDF de cada documento de taller desde el servidor.
  for (const doc of ['work-order', 'cuts', 'glass', 'materials', 'materials-costs', 'assembly', 'costs', 'labels', 'purchase']) {
    const res = await page.request.get(`/api/work-orders/${orderId}/pdf?doc=${doc}`, { timeout: 90_000 })
    expect.soft(res.status(), `PDF de taller «${doc}»`).toBe(200)
    if (res.ok()) {
      const body = await res.body()
      expect.soft(body.subarray(0, 4).toString(), `PDF «${doc}» empieza con %PDF`).toBe('%PDF')
    }
  }

  // Descargas desde la interfaz: «Descargar OT» de la cabecera (en Resumen; en las otras pestañas va
  // en el menú «Toda la OT») y la hoja de cortes para imprimir.
  for (const open of [
    async () => {
      await page.getByRole('tab', { name: /^Resumen/ }).first().click()
      await page.getByRole('button', { name: 'Descargar OT' }).click()
    },
    async () => {
      await page.getByRole('tab', { name: /^Cortes/ }).first().click()
      await page.getByRole('radio', { name: 'Hoja para imprimir' }).click()
      await page.getByRole('tabpanel', { name: 'Cortes' }).getByRole('button', { name: /Descargar/ }).first().click()
    },
  ]) {
    const dl = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null)
    await open()
    const file = await dl
    expect(file, 'descarga un PDF de taller').not.toBeNull()
    if (file) expect(file.suggestedFilename()).toMatch(/\.pdf$/)
  }

  // Etiquetas «Rollo»: la web pide ?labels=roll (el servidor acepta también ?format=roll); el PDF debe salir en rollo de 100 × 50 mm.
  const sheet = mediaBox(await (await page.request.get(`/api/work-orders/${orderId}/pdf?doc=labels`)).body())
  const roll = mediaBox(await (await page.request.get(`/api/work-orders/${orderId}/pdf?doc=labels&labels=roll&glass=1`)).body())
  const rollAlias = mediaBox(await (await page.request.get(`/api/work-orders/${orderId}/pdf?doc=labels&format=roll`)).body())
  test.info().annotations.push({
    type: 'etiquetas',
    description: `hoja ${JSON.stringify(sheet)} · rollo con ?labels=roll (web) ${JSON.stringify(roll)} · rollo con ?format=roll (alias) ${JSON.stringify(rollAlias)}`,
  })
  expect.soft(roll, 'el PDF de etiquetas en «Rollo» (parámetro que manda la web) debería medir 100 × 50 mm ≈ 283 × 142 pt').not.toEqual(sheet)
  expect.soft(rollAlias, 'el alias ?format=roll debería dar el mismo rollo').toEqual(roll)

  // Compras sin precios: la web pide ?prices=0; el documento no debería traer montos.
  const poHtml = await (await page.request.get(`/api/work-orders/${orderId}/pdf?doc=purchase&prices=0&format=html`)).text()
  const amounts = poHtml.match(/\$\s?\d{1,3}(\.\d{3})+/g) ?? []
  test.info().annotations.push({ type: 'compras-sin-precios', description: `${amounts.length} montos en la orden de compra pedida sin precios` })
  expect.soft(amounts.length, 'la orden de compra pedida «sin precios» no debería mostrar montos').toBe(0)

  // Con la OT creada el editor ofrece «Ver OT N° X» y abre la misma OT (no duplica).
  await page.goto(`/cotizaciones/${quoteId}`)
  await page.getByRole('button', { name: /^Ver OT N° \d+$/ }).click()
  await page.waitForURL(new RegExp(`/taller/${orderId}$`), { timeout: 20_000 })
  const orders = await api<{ items: WorkOrder[]; total: number }>(page.request, 'GET', `/work-orders?quoteId=${quoteId}`)
  expect(orders.total, 'una sola OT por cotización').toBe(1)

  // La lista de taller la muestra.
  await page.goto('/taller')
  await expect(page.getByText('Obra taller · Los Ángeles').first()).toBeVisible()
  await shot(page, 'taller-03-lista')
})
