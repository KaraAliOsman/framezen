/**
 * Documento y PDF: vista previa en vivo con el diseño elegido, cambio de diseño en la galería, edición
 * directa de textos (se guarda sola y solo en esta cotización), descarga del PDF desde el
 * editor y PDF de los diseños desde la API (mismas cifras que el editor).
 */
import { addWindow, api, expect, footerTotal, newQuoteFromUi, shot, signupApi, test, waitSaved } from './fixtures'
import type { Quote } from '../packages/shared/src/api'

test('documento en vivo, plantillas, texto editable y PDF', async ({ page }) => {
  await signupApi(page, 'documento')
  const id = await newQuoteFromUi(page)
  await addWindow(page, 'corredera', 1500, 1200)
  await addWindow(page, 'abatible', 600, 900)
  await page.locator('textarea[aria-label="Nombre de la obra"]').fill('Depto 1204 · Ñuñoa')
  const total = await footerTotal(page)

  // Segmentado Diseño | Documento.
  await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Documento' }).click()
  const preview = page.getByRole('region', { name: 'Documento para el cliente' }).or(page.locator('section[aria-label="Documento para el cliente"]')).first()
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('Depto 1204 · Ñuñoa')
  await expect(preview).toContainText(/Cotización\s*N°\s*\d+/)
  await expect(preview).toContainText('V1')
  await expect(preview).toContainText('V2')
  const totalText = new Intl.NumberFormat('es-CL').format(total)
  await expect(preview, `el documento muestra el mismo total que el pie ($${totalText})`).toContainText(totalText)
  await shot(page, 'documento-01-luz')

  // Diseños: el botón muestra el diseño en uso y abre la galería (cada diseño dibujado con esta
  // cotización). Los diseños de v6 se dibujan sin errores y se vuelve al predeterminado (Hogar).
  const gallery = page.getByRole('dialog', { name: 'Diseño del documento' })
  for (const name of ['Atelier', 'Corporativa', 'Obra', 'Memoria', 'Hogar']) {
    await page.getByRole('button', { name: /^Diseño del documento: .+\. Ver todos los diseños$/ }).first().click()
    await expect(gallery).toBeVisible()
    await gallery.getByRole('button', { name: new RegExp(`^${name}`) }).click()
    await expect(gallery).toBeHidden()
    await expect(page.getByRole('button', { name: `Diseño del documento: ${name}. Ver todos los diseños` }).first()).toBeVisible()
    await expect(preview).toContainText('Depto 1204 · Ñuñoa')
    await expect(preview).toContainText(totalText)
    await shot(page, `documento-02-${name.toLowerCase().replace(/\s+/g, '-')}`)
  }

  // Edición directa de un texto del documento (contentEditable).
  // La carta de presentación viene oculta: se edita la garantía, que sí está a la vista.
  const intro = preview.locator('[contenteditable][data-field="warranty"]').first()
  await expect(intro).toBeVisible()
  await intro.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Estimado Pedro: gracias por preferirnos. Instalamos en 10 días hábiles.')
  await preview.locator('[contenteditable][data-field="warranty"]').first().evaluate((el) => (el as HTMLElement).blur())
  await waitSaved(page)
  let saved = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(saved.documentOverrides?.texts?.warranty).toBe('Estimado Pedro: gracias por preferirnos. Instalamos en 10 días hábiles.')

  // Se mantiene tras recargar (la vista Documento se recuerda o se vuelve a elegir).
  await page.reload()
  const docRadio = page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Documento' })
  if ((await docRadio.getAttribute('aria-checked')) !== 'true') await docRadio.click()
  await expect(preview).toContainText('gracias por preferirnos')

  // Descargar PDF desde el editor: debe bajar un PDF real (Chromium en el servidor) o abrir la impresión.
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null)
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).click()
  const download = await downloadPromise
  expect(download, 'Descargar PDF debería bajar un archivo .pdf').not.toBeNull()
  if (download) {
    expect(download.suggestedFilename()).toMatch(/\.pdf$/)
    test.info().annotations.push({ type: 'pdf', description: download.suggestedFilename() })
  }
  await expect(page.getByText('Descargamos el PDF.')).toBeVisible()

  // PDF por la API con los diseños v5 (y un id v4, que sigue resolviendo a su equivalente): application/pdf y %PDF.
  for (const template of ['hogar', 'hogar', 'obra', 'atelier', 'esencial']) {
    const started = Date.now()
    const res = await page.request.get(`/api/quotes/${id}/pdf?template=${template}`, { timeout: 90_000 })
    expect(res.status(), `PDF ${template}`).toBe(200)
    expect(res.headers()['content-type']).toContain('application/pdf')
    const body = await res.body()
    expect(body.subarray(0, 4).toString()).toBe('%PDF')
    expect(body.length).toBeGreaterThan(5_000)
    test.info().annotations.push({ type: 'pdf-tiempo', description: `${template}: ${Date.now() - started} ms, ${Math.round(body.length / 1024)} KB` })
  }

  // El servidor cotiza lo mismo que el editor.
  saved = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(saved.totals?.total).toBe(total)

  // El HTML del PDF lleva el texto editado y el mismo total.
  const html = await (await page.request.get(`/api/quotes/${id}/pdf?template=luz&format=html`)).text()
  expect.soft(html, 'el PDF usa el saludo editado en esta cotización').toContain('gracias por preferirnos')
  expect.soft(html, 'el PDF muestra el mismo total').toContain(totalText)

  // El portal del cliente muestra el mismo saludo editado que el PDF.
  const sent = await api<{ url: string }>(page.request, 'POST', `/quotes/${id}/send`, { channel: 'link' })
  const token = new URL(sent.url).pathname.split('/').pop()!
  const pub = await (await page.request.get(`/api/public/quotes/${token}`)).json()
  expect.soft(pub.documents?.warranty ?? '', 'el portal usa los textos editados de esta cotización').toContain('gracias por preferirnos')
  const portal = await page.context().newPage()
  await portal.goto(`/c/${token}`)
  await expect.soft(portal.getByText(/gracias por preferirnos/).first(), 'el portal muestra el saludo editado').toBeVisible()
  await portal.close()
})
