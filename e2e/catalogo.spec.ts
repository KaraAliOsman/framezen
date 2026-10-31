/**
 * Catálogo: activar una marca, editar un precio en línea (queda como «Tuyo») e importar un CSV
 * «MisPrecios» pequeño inventado (vista previa → aplicar). Los precios propios cambian lo que
 * cuesta una ventana nueva.
 */
import { addWindow, api, expect, footerTotal, newQuoteFromUi, shot, signupApi, test } from './fixtures'
import type { CatalogBrandsResponse, CatalogResponse, OrgSettings, PriceOverridesResponse } from '../packages/shared/src/api'

test('activar marca, editar un precio e importar CSV', async ({ page }) => {
  await signupApi(page, 'catalogo')

  // Cotización de referencia con la línea por defecto (para ver el efecto de los precios).
  await newQuoteFromUi(page)
  await addWindow(page, 'fijo', 1500, 1200)
  const before = await footerTotal(page)
  const quoteUrl = page.url()

  const settings = await api<OrgSettings>(page.request, 'GET', '/settings')
  const catalog = await api<CatalogResponse>(page.request, 'GET', '/catalog')
  const line = catalog.lines.find((l) => l.id === settings.defaults.lineId)!
  const brand = catalog.brands.find((b) => b.id === line.brandId)!
  const color = catalog.colors.find((c) => c.id === settings.defaults.colorId)!
  const frame = catalog.profiles.find((p) => p.lineId === line.id && p.role === 'frame')!
  expect(frame, 'la línea por defecto tiene perfil de marco').toBeTruthy()

  // 1) Activar una marca apagada.
  const brands = await api<CatalogBrandsResponse>(page.request, 'GET', '/catalog/brands')
  const off = brands.items.find((b) => !b.enabled && b.counts.lines > 0 && b.completeness === 'complete') ?? brands.items.find((b) => !b.enabled && b.counts.lines > 0)!
  await page.goto('/catalogo')
  await expect(page.getByRole('heading', { name: 'Catálogo' }).first()).toBeVisible()
  const search = page.getByLabel('Buscar marca')
  if (await search.isVisible().catch(() => false)) await search.fill(off.brand.name)
  await page.getByRole('switch', { name: `Activar ${off.brand.name}` }).click()
  await expect(page.getByRole('switch', { name: `${off.brand.name} activa` })).toBeVisible()
  await shot(page, 'catalogo-01-marca-activada')
  await expect.poll(async () => (await api<CatalogBrandsResponse>(page.request, 'GET', '/catalog/brands')).items.find((b) => b.brand.id === off.brand.id)?.enabled).toBe(true)

  // 2) Editar un precio en la tabla (marco de la línea por defecto, en su color).
  await page.getByRole('tab', { name: 'Precios' }).click()
  await page.getByLabel('Buscar precios').fill(frame.code)
  const listPrice = frame.priceByColor[color.id] ?? 0
  const newPrice = Math.max(1000, Math.round(listPrice * 3))
  const cell = page.getByRole('button', { name: new RegExp(`^Precio de .*${frame.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*${color.name}|^Precio de .*${color.name}.*${frame.code}`) }).first()
  const anyCell = page.getByRole('button', { name: /^Precio de / }).first()
  const target = (await cell.count()) ? cell : anyCell
  const targetLabel = (await target.getAttribute('aria-label'))!
  await target.click()
  const input = page.getByRole('textbox', { name: targetLabel })
  await expect(input).toBeFocused()
  await input.fill(String(newPrice))
  await input.press('Enter')
  await expect(page.getByText('Tuyo').first()).toBeVisible()
  await shot(page, 'catalogo-02-precio-editado')
  await expect.poll(async () => (await api<PriceOverridesResponse>(page.request, 'GET', '/catalog/prices')).overrides.length).toBeGreaterThan(0)

  // 3) Importar un CSV pequeño inventado: una fila que calza (el marco) y otra que no existe.
  const csvPrice = newPrice + 4321
  const csv = [
    'Marca;Tipo;Código;Descripción;Línea;Color;Precio',
    `${brand.name};Perfil · Marco;${frame.code};${frame.name};${line.name};${color.name};${csvPrice}`,
    `${brand.name};Perfil · Marco;ZZ-NO-EXISTE-99;Perfil inventado que no existe;${line.name};${color.name};9990`,
  ].join('\r\n')
  await page.getByRole('tab', { name: 'Importar' }).click()
  await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({ name: 'mis-precios.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿' + csv, 'utf8') })
  await expect(page.getByText('mis-precios.csv')).toBeVisible()
  await expect(page.getByText('precios cambian', { exact: true })).toBeVisible()
  await expect(page.getByText('no encontrados', { exact: true })).toBeVisible()
  await shot(page, 'catalogo-03-csv-vista-previa', { fullPage: true })
  const apply = page.getByRole('button', { name: /^Aplicar/ })
  await expect(apply).toBeEnabled()
  await apply.click()
  await expect(page.getByText('precios actualizados', { exact: true })).toBeVisible()
  await shot(page, 'catalogo-04-csv-aplicado')
  const overrides = await api<PriceOverridesResponse>(page.request, 'GET', '/catalog/prices')
  const csvOverride = overrides.overrides.find((o) => o.kind === 'profile' && o.id === frame.id && (o.colorId ?? color.id) === color.id)
  expect(csvOverride?.price, 'el precio del CSV queda como precio propio del marco').toBe(csvPrice)

  // 4) Efecto: una ventana nueva con la misma línea cuesta más (el marco subió).
  await page.goto(quoteUrl)
  await addWindow(page, 'fijo', 1500, 1200)
  const rows = page.getByRole('list', { name: 'Ventanas de la cotización' }).getByRole('button', { name: /^V\d+,/ })
  await expect(rows).toHaveCount(2)
  const v1 = Number(((await rows.nth(0).getAttribute('aria-label'))!.match(/\$([\d.]+)$/)?.[1] ?? '0').replace(/\./g, ''))
  const v2 = Number(((await rows.nth(1).getAttribute('aria-label'))!.match(/\$([\d.]+)$/)?.[1] ?? '0').replace(/\./g, ''))
  test.info().annotations.push({ type: 'precio', description: `antes ${before} · V1 abierta ${v1} · V2 nueva ${v2}` })
  expect(v2, 'la ventana nueva usa el precio del CSV').toBeGreaterThan(before / 1.19 - 1)
  expect(v1, 'la V1 ya cotizada se recalcula con el precio vigente del catálogo').toBe(v2)
})
