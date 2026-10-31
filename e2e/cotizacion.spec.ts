/**
 * Cotización completa con 3 ventanas, como la haría un dueño de taller: galería → ancho/alto → Enter.
 * Comprueba autoguardado (recarga sin pérdidas), que el servidor calcule lo mismo que el
 * navegador, deshacer, la lista de cotizaciones y el conflicto de versión entre pestañas.
 */
import {
  addWindow,
  api,
  expect,
  footerTotal,
  itemRow,
  itemsList,
  newQuoteFromUi,
  pickerDialog,
  shot,
  signupApi,
  test,
  waitSaved,
} from './fixtures'
import type { Quote } from '../packages/shared/src/api'

test.describe('Cotización completa', () => {
  test('3 ventanas, cliente, título, cantidad; recarga sin pérdidas y mismo total que el servidor', async ({ page }) => {
    await signupApi(page, 'cotiza')
    const started = Date.now()
    const id = await newQuoteFromUi(page)

    // Una cotización nueva abre la galería sola: el primer paso es elegir la ventana.
    await expect(pickerDialog(page)).toBeVisible()
    await shot(page, 'cotiza-01-galeria')

    await addWindow(page, 'corredera', 1800, 1200)
    await addWindow(page, 'oscilobatiente', 700, 1100, { viaShortcut: true }) // atajo A
    await addWindow(page, 'puerta', 900, 2100)

    await expect(itemsList(page).getByRole('button', { name: /^V\d+,/ })).toHaveCount(3)
    await expect(itemRow(page, 'V1')).toHaveAccessibleName(/Corredera.*1\.800 × 1\.200 mm/)
    await expect(itemRow(page, 'V2')).toHaveAccessibleName(/Oscilobatiente.*700 × 1\.100 mm/)
    await expect(itemRow(page, 'V3')).toHaveAccessibleName(/Puerta.*900 × 2\.100 mm/)
    const elapsed = Date.now() - started
    test.info().annotations.push({ type: 'tiempo', description: `3 ventanas en ${Math.round(elapsed / 1000)} s (SPEC: primera cotización < 3 min)` })
    expect(elapsed).toBeLessThan(180_000)

    // Título de obra en línea y cliente creado desde el combobox, sin salir del editor.
    const title = page.locator('textarea[aria-label="Nombre de la obra"]')
    await title.click()
    await title.fill('Casa Pérez · Concepción')
    await title.press('Enter')
    await page.getByRole('combobox', { name: 'Cliente' }).or(page.getByRole('button', { name: 'Cliente' })).first().click()
    await page.getByPlaceholder('Busca o escribe un nombre…').fill('Pedro Soto')
    await page.getByRole('option', { name: /Crear cliente/ }).click()
    await expect(page.getByText(/Creaste a Pedro Soto/)).toBeVisible()

    // Cantidad de la V2 = 2 desde el inspector.
    await itemRow(page, 'V2').click()
    const inspector = page.locator('aside[aria-label="Inspector"]')
    await inspector.getByRole('button', { name: 'Una más' }).first().click()
    await expect(itemRow(page, 'V2')).toHaveAccessibleName(/2 unidades/)

    const total = await footerTotal(page)
    expect(total).toBeGreaterThan(0)
    await waitSaved(page)
    await shot(page, 'cotiza-02-tres-ventanas')

    // El servidor recalcula con el mismo motor: el total guardado debe ser el que ve la persona.
    const saved = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
    expect(saved.items).toHaveLength(3)
    expect(saved.title).toBe('Casa Pérez · Concepción')
    expect(saved.client?.name ?? '').toBe('Pedro Soto')
    expect(saved.items[1].qty).toBe(2)
    expect(saved.totals?.total, 'total del servidor = total del editor').toBe(total)

    // Recargar no pierde nada.
    await page.reload()
    await expect(itemsList(page).getByRole('button', { name: /^V\d+,/ })).toHaveCount(3)
    await expect(page.locator('textarea[aria-label="Nombre de la obra"]')).toHaveValue('Casa Pérez · Concepción')
    await expect(page.getByText('Pedro Soto').first()).toBeVisible()
    expect(await footerTotal(page)).toBe(total)

    // Eliminar con Supr y deshacer desde el aviso (8 s), sin diálogo de confirmación.
    await itemRow(page, 'V3').click()
    await page.keyboard.press('Delete')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(itemsList(page).getByRole('button', { name: /^V\d+,/ })).toHaveCount(2)
    await page.getByRole('button', { name: 'Deshacer' }).first().click()
    await expect(itemsList(page).getByRole('button', { name: /^V\d+,/ })).toHaveCount(3)

    // Ctrl+Z / Ctrl+Shift+Z sobre el documento.
    await itemRow(page, 'V1').click()
    await page.keyboard.press('d') // duplicar
    await expect(itemsList(page).getByRole('button', { name: /^V\d+,/ })).toHaveCount(4)
    await page.locator('body').press('Control+z')
    await expect(itemsList(page).getByRole('button', { name: /^V\d+,/ })).toHaveCount(3)
    await page.locator('body').press('Control+Shift+z')
    await expect(itemsList(page).getByRole('button', { name: /^V\d+,/ })).toHaveCount(4)
    await page.locator('body').press('Control+z')
    await expect(itemsList(page).getByRole('button', { name: /^V\d+,/ })).toHaveCount(3)
    await waitSaved(page)

    // En la lista aparece con cliente, estado y el mismo total.
    await page.goto('/cotizaciones')
    const row = page.getByRole('link', { name: new RegExp(`Casa Pérez`) }).or(page.getByRole('row', { name: /Casa Pérez/ })).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText('Pedro Soto')
    await expect(row).toContainText(/Borrador/i)
    await shot(page, 'cotiza-03-lista')
  })

  test('autoguardado: un cambio hecho justo antes de recargar no se pierde', async ({ page }) => {
    await signupApi(page, 'recarga')
    const id = await newQuoteFromUi(page)
    await addWindow(page, 'fijo', 1000, 1000)
    await waitSaved(page)
    // Cambio y recarga inmediata (antes de que venza la espera del autoguardado).
    const title = page.locator('textarea[aria-label="Nombre de la obra"]')
    await title.fill('Obra recargada al tiro')
    await page.waitForTimeout(150)
    await page.reload()
    await expect(page.locator('textarea[aria-label="Nombre de la obra"]')).toBeVisible()
    const after = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
    expect.soft(after.title, 'el título escrito 150 ms antes de recargar debería quedar guardado (o avisar antes de salir)').toBe('Obra recargada al tiro')
    await expect.soft(page.locator('textarea[aria-label="Nombre de la obra"]')).toHaveValue('Obra recargada al tiro')
  })

  test('conflicto de versión entre dos pestañas: se fusiona y nada se pierde', async ({ page, context, watch, allowProblems }) => {
    allowProblems(/http 409 PUT \/api\/quotes\//)
    await signupApi(page, 'conflicto')
    const id = await newQuoteFromUi(page)
    await addWindow(page, 'fijo', 1200, 1000)
    await page.locator('textarea[aria-label="Nombre de la obra"]').fill('Obra original')
    await waitSaved(page)

    // Otra pestaña abre la misma cotización.
    const other = await context.newPage()
    watch(other, 'otra-pestaña')
    await other.goto(`/cotizaciones/${id}`)
    await expect(other.locator('textarea[aria-label="Nombre de la obra"]')).toHaveValue('Obra original')

    // 1) Cambios en campos distintos: la otra pestaña cambia el título; esta, la cantidad.
    await other.locator('textarea[aria-label="Nombre de la obra"]').fill('Título desde la otra pestaña')
    await waitSaved(other)
    await itemRow(page, 'V1').click()
    await page.locator('aside[aria-label="Inspector"]').getByRole('button', { name: 'Una más' }).first().click()
    await waitSaved(page)
    await expect(page.getByText('Sumamos los cambios hechos en otra pestaña.')).toBeVisible()
    let server = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
    expect(server.title).toBe('Título desde la otra pestaña')
    expect(server.items[0].qty).toBe(2)
    await expect(page.locator('textarea[aria-label="Nombre de la obra"]')).toHaveValue('Título desde la otra pestaña')

    // 2) El mismo campo en ambas: gana la última guardada en el servidor y la otra ofrece recuperar.
    await other.reload()
    await expect(other.locator('textarea[aria-label="Nombre de la obra"]')).toHaveValue('Título desde la otra pestaña')
    await other.locator('textarea[aria-label="Nombre de la obra"]').fill('Versión B (otra pestaña)')
    await waitSaved(other)
    await page.locator('textarea[aria-label="Nombre de la obra"]').fill('Versión A (esta pestaña)')
    await page.waitForTimeout(1500)
    const recover = page.getByRole('button', { name: 'Recuperar mis cambios' })
    await expect(recover).toBeVisible()
    await shot(page, 'cotiza-04-conflicto')
    await recover.click()
    await expect(page.locator('textarea[aria-label="Nombre de la obra"]')).toHaveValue('Versión A (esta pestaña)')
    await waitSaved(page)
    server = await api<Quote>(page.request, 'GET', `/quotes/${id}`)
    expect(server.title).toBe('Versión A (esta pestaña)')
    expect(server.items[0].qty).toBe(2)
    await other.close()
  })
})
