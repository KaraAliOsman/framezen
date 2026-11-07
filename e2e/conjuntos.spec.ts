/**
 * Conjuntos en la app real: crear unión, bay y bow desde la galería, guardar, reabrir, PDF de la
 * cotización, portal del cliente y OT con sus documentos.
 * FZ_BASE=http://localhost:5229 npx playwright test -c e2e conjuntos.spec.ts --project=escritorio
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { addWindow, api, expect, footerTotal, itemRow, newQuoteFromUi, pickerDialog, signupApi, test, waitEditorReady, waitSaved, type Page } from './fixtures'
import type { Quote, WorkOrder } from '../packages/shared/src/api'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.scratch/v7/qa/conjuntos')
mkdirSync(OUT, { recursive: true })
const snap = (page: Page, name: string, fullPage = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage })

async function addPreset(page: Page, id: string) {
  const picker = pickerDialog(page)
  if (!(await picker.isVisible().catch(() => false))) await page.getByRole('button', { name: /Agregar ventana/ }).first().click()
  await expect(picker).toBeVisible()
  await picker.locator(`[data-preset="${id}"]`).click()
  await expect(picker).toBeHidden()
}

test('conjuntos de punta a punta: crear, guardar, reabrir, PDF, portal y OT', async ({ page, browser, watch, allowProblems }) => {
  test.setTimeout(240_000)
  allowProblems(/preview|manifest/)
  await signupApi(page, 'conjuntos', { company: 'Ventanas Conjuntos' })
  // Las marcas iniciales no traen poste de 135° ni variable: se activa la que sí, como haría el taller.
  await api(page.request, 'PATCH', '/catalog/brands/alchile', { enabled: true })
  const id = await newQuoteFromUi(page)
  await addPreset(page, 'coupled_2')
  await addPreset(page, 'bay')
  await addPreset(page, 'bow')
  await page.locator('textarea[aria-label="Nombre de la obra"]').fill('Casa Mirador')
  await waitSaved(page)
  await snap(page, '01-editor-bow')

  // Guardado: los tres ítems viajan con su conjunto.
  const saved = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(saved.items.map((i) => i.design.assembly?.kind)).toEqual(['flat', 'bay', 'bow'])
  expect(saved.items.map((i) => i.design.assembly?.root.children.length)).toEqual([2, 3, 5])

  // Reabrir: mismo dibujo, unidades y paños seleccionables.
  await page.reload()
  await waitEditorReady(page)
  await itemRow(page, 'V2').click()
  await expect(page.locator('[data-assembly-settings]').first()).toBeVisible()
  await expect(page.locator('[data-hit="cell"][data-node-id^="B:"]').first()).toBeAttached()
  await snap(page, '02-reabierto-bay')

  // Elegir un paño de la unidad C en el lienzo la deja activa en el panel.
  await page.locator('[data-hit="cell"][data-node-id^="C:"]').first().click({ force: true })
  await expect(page.locator('[data-assembly-settings]').getByRole('radio', { name: 'C', exact: true })).toBeChecked()

  // Lo que falta se dice ítem por ítem, con salida directa y sin bloquear.
  const panel = page.locator('[data-pending-panel]')
  await expect(panel).toBeVisible()
  await expect(panel.locator('[data-pending-kind="price"]').first()).toContainText(/Sin precio: S632/)
  const href = await panel.getByRole('link', { name: 'Ver en catálogo' }).first().getAttribute('href')
  expect(href).toMatch(/^\/catalogo\?tab=precios&buscar=S632/)
  await snap(page, '02b-faltantes')

  // Volumen del lienzo y vuelta al desarrollo.
  await page.getByRole('radio', { name: 'Volumen' }).click()
  await page.waitForTimeout(900)
  await snap(page, '02c-volumen-bay')
  await page.getByRole('radio', { name: 'Desarrollo' }).click()

  // Contorno: V1 está en una línea con premarco; se elige en el panel y queda guardado en su unidad.
  await itemRow(page, 'V1').click()
  await page.getByRole('button', { name: /^Accesorios/ }).click()
  await page.getByRole('switch', { name: 'Premarco' }).click()
  await waitSaved(page)
  await snap(page, '02d-contorno')
  const withAddon = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  const firstUnit = withAddon.items[0].design.assembly?.root.children[0]
  expect(firstUnit?.type === 'unit' ? firstUnit.design.extras?.frameAddons?.[0]?.kind : null).toBe('subframe')

  // A tamaño completo: bay y bow en volumen, interior y exterior.
  await page.setViewportSize({ width: 1920, height: 1200 })
  for (const [ref, name] of [['V2', 'bay'], ['V3', 'bow']]) {
    await itemRow(page, ref).click()
    await page.getByRole('radio', { name: 'Volumen' }).click()
    await page.waitForTimeout(900)
    await snap(page, `05-${name}-volumen-interior`)
    await page.getByRole('radio', { name: 'Exterior' }).click()
    await page.waitForTimeout(900)
    await snap(page, `06-${name}-volumen-exterior`)
    await page.getByRole('radio', { name: 'Interior' }).click()
    await page.getByRole('radio', { name: 'Desarrollo' }).click()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await itemRow(page, 'V2').click()

  // Precio manual en el mismo lugar: la ventana entra al total.
  const before = await footerTotal(page)
  await panel.getByRole('textbox', { name: 'O pon un precio manual' }).fill('900000')
  await panel.getByRole('button', { name: 'Usar este precio' }).click()
  await expect(panel).toHaveCount(0)
  expect(await footerTotal(page)).toBeGreaterThan(before)
  await waitSaved(page)

  // PDF real de la cotización.
  const pdf = await page.request.get(`/api/quotes/${id}/pdf`, { timeout: 120_000 })
  expect(pdf.status(), await pdf.text().then((t) => t.slice(0, 200)).catch(() => '')).toBe(200)
  const body = await pdf.body()
  expect(body.subarray(0, 4).toString()).toBe('%PDF')
  writeFileSync(path.join(OUT, 'cotizacion.pdf'), body)
  const html = await (await page.request.get(`/api/quotes/${id}/pdf?format=html`, { timeout: 120_000 })).text()
  writeFileSync(path.join(OUT, 'cotizacion.html'), html)
  const paper = await page.context().newPage()
  await paper.setViewportSize({ width: 900, height: 1200 })
  await paper.setContent(html, { waitUntil: 'load' })
  await paper.waitForTimeout(800)
  await snap(paper, '07-documento', true)
  await paper.close()
  expect(html).toContain('data-assembly="bay"')
  expect(html).toContain('data-assembly="bow"')
  expect(html).toContain('data-layer="plan"')

  // Portal del cliente.
  await page.getByRole('button', { name: 'Enviar al cliente' }).click()
  const dialog = page.getByRole('dialog', { name: 'Enviar al cliente' })
  await dialog.getByRole('radio', { name: 'Enlace web' }).click()
  await dialog.getByRole('button', { name: 'Crear enlace' }).click()
  const link = dialog.getByLabel('Enlace del cliente')
  await expect(link).toHaveValue(/\/c\/[\w-]+/, { timeout: 60_000 })
  const token = new URL(await link.inputValue()).pathname.split('/').pop()!
  await page.keyboard.press('Escape')
  const client = await browser.newContext({ locale: 'es-CL', timezoneId: 'America/Santiago', viewport: { width: 1280, height: 900 } })
  const portal = await client.newPage()
  watch(portal, 'portal')
  await portal.goto(`/c/${token}`)
  await expect(portal.getByRole('heading', { name: 'Casa Mirador' })).toBeVisible()
  await expect(portal.locator('svg[data-assembly="bow"]').first()).toBeAttached({ timeout: 20_000 })
  await portal.waitForTimeout(1500)
  await snap(portal, '03-portal', true)
  await client.close()

  // OT y sus documentos.
  await page.getByRole('button', { name: 'Más acciones' }).click()
  await page.getByRole('menuitem', { name: 'Pasar a taller' }).click()
  await page.waitForURL(/\/taller\/[^/]+$/, { timeout: 30_000 })
  const orderId = new URL(page.url()).pathname.split('/').pop()!
  await snap(page, '04-ot')
  const order = await api<WorkOrder>(page.request, 'GET', `/work-orders/${orderId}`)
  expect(order.id).toBe(orderId)
  for (const doc of ['work-order', 'cuts', 'glass', 'materials', 'assembly', 'labels', 'purchase']) {
    const res = await page.request.get(`/api/work-orders/${orderId}/pdf?doc=${doc}`, { timeout: 120_000 })
    expect(res.status(), `documento ${doc}: ${await res.text().then((t) => t.slice(0, 200)).catch(() => '')}`).toBe(200)
    writeFileSync(path.join(OUT, `ot-${doc}.pdf`), await res.body())
  }
  const cuts = await (await page.request.get(`/api/work-orders/${orderId}/pdf?doc=cuts&format=html`, { timeout: 120_000 })).text()
  writeFileSync(path.join(OUT, 'ot-cortes.html'), cuts)
  const sheet = await page.context().newPage()
  await sheet.setViewportSize({ width: 1100, height: 1200 })
  await sheet.setContent(cuts, { waitUntil: 'load' })
  await sheet.waitForTimeout(500)
  await snap(sheet, '08-ot-cortes', true)
  await sheet.close()
  expect(cuts).toMatch(/acople|poste/)
})

/** Acerca el cursor al borde y hace clic en el «+» que aparece ahí. */
async function plus(page: Page, unit: string, side: string) {
  const button = page.locator(`[data-join-unit="${unit}"][data-join-side="${side}"]`).first()
  const at = await button.boundingBox()
  await page.mouse.move(at!.x + 12, at!.y + 12, { steps: 3 })
  await expect(button).toHaveAttribute('data-shown', 'true')
  const now = await button.boundingBox()
  await page.mouse.click(now!.x + 12, now!.y + 12)
}

test('armar un bow desde el dibujo: «+», ángulo, dirección y esquina al otro lado', async ({ page, allowProblems }) => {
  allowProblems(/preview|manifest/)
  await signupApi(page, 'unir-dibujo', { company: 'Ventanas Unidas' })
  const id = await newQuoteFromUi(page)
  await addWindow(page, 'fijo', 1000, 1400)

  await plus(page, '', 'right')
  const joint = page.locator('[data-joint-editor="J1"]')
  await joint.getByRole('radio', { name: '150°' }).click()
  await plus(page, 'B', 'right')
  await expect(page.locator('[data-joint-chip="J2"]')).toContainText('150')
  await waitSaved(page)
  let quote = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(quote.items[0].design.assembly).toMatchObject({ kind: 'bow', root: { joints: [{ angle: 150 }, { angle: 150 }] } })

  await page.getByRole('button', { name: 'Afuera ↔ adentro' }).click()
  await waitSaved(page)
  quote = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(quote.items[0].design.assembly?.root.joints.map((j) => j.angle)).toEqual([210, 210])

  await addWindow(page, 'fijo', 1000, 1400)
  await plus(page, '', 'left')
  await page.locator('[data-joint-editor="J1"]').getByRole('radio', { name: '90°' }).click()
  await waitSaved(page)
  quote = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
  expect(quote.items[1].design.assembly).toMatchObject({ kind: 'corner', front: 'end' })
})
