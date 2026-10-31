/**
 * Envío y portal del cliente: «Enviar al cliente» deja el enlace listo (versión A), editar y
 * reenviar crea la B, el cliente (sin sesión) ve siempre la última, sin notas internas ni costos,
 * pide cambios, descarga el PDF y acepta con su nombre. El editor queda «Aceptada».
 */
import { addWindow, api, expect, footerTotal, itemRow, newQuoteFromUi, shot, signupApi, test, waitSaved } from './fixtures'
import type { PublicQuoteResponse, Quote } from '../packages/shared/src/api'

test('enviar, versión B, portal sin sesión: pedir cambios, PDF y aceptar', async ({ page, browser, watch }) => {
  await signupApi(page, 'portal', { company: 'Ventanas del Sur' })
  const id = await newQuoteFromUi(page)
  await addWindow(page, 'corredera', 1800, 1200)
  await addWindow(page, 'oscilobatiente', 700, 1100)
  await page.locator('textarea[aria-label="Nombre de la obra"]').fill('Casa Soto · Temuco')

  // Nota interna: nunca debe llegar al cliente.
  await page.locator('aside[aria-label="Inspector"]').getByRole('tab', { name: 'Cotización' }).or(page.getByRole('radio', { name: 'Cotización' })).first().click()
  const notes = page.locator('aside[aria-label="Inspector"] textarea').last()
  await notes.fill('NOTA INTERNA: el cliente regatea, no bajar de 10 %')
  await waitSaved(page)

  // Enviar → enlace listo, se copia al portapapeles.
  await page.getByRole('button', { name: 'Enviar al cliente' }).click()
  const dialog = page.getByRole('dialog', { name: 'Enviar al cliente' })
  await expect(dialog).toBeVisible()
  const linkInput = dialog.getByLabel('Enlace del cliente')
  await expect(linkInput).toHaveValue(/\/c\/[\w-]+/, { timeout: 20_000 })
  const linkA = await linkInput.inputValue()
  await dialog.getByRole('button', { name: 'Copiar' }).click()
  await expect(dialog.getByRole('button', { name: 'Copiado' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(linkA)
  await expect(dialog.getByLabel('Mensaje para el cliente')).toHaveValue(/Casa Soto · Temuco/)
  await shot(page, 'portal-01-enviar')
  await dialog.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByText(/Enviada/).first()).toBeVisible()

  // El enlace debe abrir en esta misma app (APP_URL bien configurado en desarrollo).
  expect(new URL(linkA).origin, 'el enlace del portal apunta a la web que se está usando').toBe(new URL(page.url()).origin)

  // Editar después de enviar y reenviar → versión B con el mismo enlace.
  await itemRow(page, 'V2').click()
  await page.locator('aside[aria-label="Inspector"]').getByRole('tab', { name: 'Ventana' }).or(page.getByRole('radio', { name: 'Ventana' })).first().click().catch(() => {})
  await page.locator('aside[aria-label="Inspector"]').getByRole('button', { name: 'Una más' }).first().click()
  const totalB = await footerTotal(page)
  await waitSaved(page)
  await page.getByRole('button', { name: 'Enviar al cliente' }).click()
  await expect(dialog).toContainText(/versión B/)
  const linkB = await dialog.getByLabel('Enlace del cliente').inputValue()
  expect(new URL(linkB).pathname).toBe(new URL(linkA).pathname)
  await dialog.getByRole('button', { name: 'Listo' }).click()

  // El cliente abre el enlace sin sesión.
  const token = new URL(linkB).pathname.split('/').pop()!
  const clientCtx = await browser.newContext({ locale: 'es-CL', timezoneId: 'America/Santiago', viewport: { width: 1280, height: 860 } })
  const portal = await clientCtx.newPage()
  watch(portal, 'portal')
  await portal.goto(`/c/${token}`)
  await expect(portal.getByRole('heading', { name: 'Casa Soto · Temuco' })).toBeVisible()
  await expect(portal.getByText('Ventanas del Sur').first()).toBeVisible()
  const body = await portal.locator('body').innerText()
  expect(body).not.toContain('NOTA INTERNA')
  expect(body).toContain(new Intl.NumberFormat('es-CL').format(totalB))
  await expect(portal.getByText(/versión B|Versión B|Rev\.? B|\bB\b/).first()).toBeVisible()
  await shot(portal, 'portal-02-cliente', { fullPage: true })

  // La API pública no expone costos ni notas internas.
  const pub = await (await portal.request.get(`/api/public/quotes/${token}`)).json() as PublicQuoteResponse
  expect(pub.quote.notes ?? '').toBe('')
  expect(pub.revisionLabel).toBe('B')
  expect(JSON.stringify(pub)).not.toContain('NOTA INTERNA')
  expect(pub.quote.totals?.total).toBe(totalB)

  // Vista 3D (incluida en la prueba con funciones de Pro).
  const view3d = portal.getByRole('button', { name: /Ver en 3D/ }).first()
  if (await view3d.isVisible().catch(() => false)) {
    await view3d.click()
    const dlg = portal.getByRole('dialog').first()
    await expect(dlg).toBeVisible()
    await expect(dlg.locator('canvas').first().or(dlg.getByText(/3D/).first())).toBeVisible({ timeout: 15_000 })
    await portal.waitForTimeout(1200)
    await shot(portal, 'portal-02b-3d')
    await portal.keyboard.press('Escape')
    await expect(dlg).toBeHidden()
  }

  // Pedir cambios: un mensaje, sin cuenta.
  await portal.getByRole('button', { name: /Pedir cambios/ }).first().click()
  const changes = portal.getByRole('dialog', { name: 'Pedir cambios' })
  await changes.getByLabel('¿Qué te gustaría cambiar?').fill('¿Se puede la corredera en nogal?')
  await changes.getByRole('button', { name: /Enviar/ }).click()
  await expect(portal.getByRole('dialog', { name: 'Mensaje enviado' })).toBeVisible()
  await portal.keyboard.press('Escape')

  // PDF desde el portal.
  const dl = portal.waitForEvent('download', { timeout: 60_000 }).catch(() => null)
  await portal.getByRole('button', { name: 'Descargar PDF' }).click()
  const pdf = await dl
  expect(pdf, 'el cliente puede descargar el PDF').not.toBeNull()
  if (pdf) expect(pdf.suggestedFilename()).toMatch(/\.pdf$/)

  // Aceptar con nombre (RUT opcional con aviso, nunca bloquea).
  await portal.getByRole('button', { name: /^Aceptar/ }).first().click()
  const accept = portal.getByRole('dialog', { name: 'Aceptar cotización' })
  await accept.getByLabel('Tu nombre').fill('Pedro Soto')
  await accept.getByLabel(/RUT/).fill('12.345.678-9') // dígito verificador dudoso: solo aviso
  await accept.getByRole('button', { name: 'Acepto la cotización' }).click()
  await expect(portal.getByRole('dialog', { name: 'Cotización aceptada' })).toBeVisible()
  await shot(portal, 'portal-03-aceptada')
  await portal.getByRole('dialog', { name: 'Cotización aceptada' }).getByRole('button', { name: 'Cerrar' }).last().click()
  await expect(portal.getByText('Aceptada por Pedro Soto')).toBeVisible()

  // Volver a aceptar es idempotente.
  const again = await (await portal.request.post(`/api/public/quotes/${token}/accept`, { data: { name: 'Pedro Soto' } })).json()
  expect(again.alreadyAccepted).toBe(true)
  await clientCtx.close()

  // El taller ve la cotización aceptada (y el pedido de cambios en la actividad).
  await page.reload()
  await expect(page.getByText(/Aceptada/).first()).toBeVisible()
  const q = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(q.status).toBe('accepted')
  expect(q.acceptedBy?.name).toBe('Pedro Soto')
  await page.goto('/inicio')
  await expect(page.getByText(/Pedro Soto/).first()).toBeVisible()
  await shot(page, 'portal-04-inicio-tras-aceptar')
})
