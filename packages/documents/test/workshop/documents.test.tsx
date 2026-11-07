import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  AssemblyChecklistDocument,
  CostDocument,
  CutOptimizationDocument,
  GlassListDocument,
  LabelsDocument,
  MaterialsDocument,
  PurchaseOrderDocument,
  WORKSHOP_DOCUMENTS,
  WorkOrderDocument,
  WORKSHOP_FIT_SCRIPT,
  WorkshopDocument,
  assemblyChecklistSheets,
  fitWorkshopSheets,
  sampleWorkshopData,
  workshopCss,
  workshopLabelCount,
  workshopLabels,
  type WorkshopDocumentData,
} from '../../src/workshop'
import { hasInsulatedGlassSupplies } from '../../src/workshop/glass'
import { lineDetail, unitPlural } from '../../src/workshop/materials'

const data = sampleWorkshopData()
const count = (html: string, needle: string) => html.split(needle).length - 1
/** Texto visible aproximado (sin etiquetas ni CSS), para buscar frases. */
const text = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

describe('cotización sin nombre de obra', () => {
  it('el pie y la cabecera no repiten el número', () => {
    const data = sampleWorkshopData()
    const unnamed = { ...data, quote: { ...data.quote, number: 7, title: 'Cotización N° 7' }, workOrder: { ...data.workOrder, fromQuote: true } }
    const plain = renderToStaticMarkup(<CutOptimizationDocument data={unnamed} />)
    expect(plain).not.toContain('Cotización N° 7 · Cotización N° 7')
    expect(plain).not.toContain('Optimización de cortes · Cotización N° 7')
    expect(plain).toContain('Cotización N° 7')
  })
})

describe('Orden de trabajo', () => {
  const html = renderToStaticMarkup(<WorkOrderDocument data={data} />)
  const plain = text(html)

  it('una hoja por ventana con cabecera, dibujo y estaciones', () => {
    expect(count(html, 'class="fzw-sheet')).toBe(data.windows.length)
    expect(plain).toContain('OT N° 38')
    expect(plain).toContain('Cotización N° 412 · Casa Pérez · Concepción')
    expect(plain).toContain('31 de octubre de 2026')
    expect(count(html, 'class="fzw-stations"')).toBe(data.windows.length)
    for (const s of ['Corte', 'Soldadura', 'Armado', 'Herrajes', 'Vidriado', 'Control', 'Listo']) expect(plain).toContain(s)
    // Dibujo acotado del módulo compartido.
    expect(count(html, 'class="fzw-drawing"')).toBe(data.windows.length)
    expect(html).toContain('<svg')
  })

  it('cortes con medida grande, lado, ángulos y código de pieza', () => {
    expect(plain).toContain('2.246')
    expect(plain).toContain('554,5')
    expect(plain).toContain('arriba · abajo')
    expect(plain).toContain('45° · 45°')
    // Trapecio: ingletes reales, resaltados.
    expect(plain).toContain('58,3° · 31,7°')
    expect(plain).toContain('M01 · M02')
    expect(plain).toContain('M01-R · M02-R')
    // Travesaño de los dos fijos presente (el competidor lo omitía).
    const v6 = html.slice(html.lastIndexOf('<section'))
    expect(text(v6)).toContain('Travesaño 80')
    expect(text(v6)).toContain('900')
  })

  it('multiplica por unidades y consolida herrajes', () => {
    expect(plain).toContain('2 × 2') // V3: 2 piezas por unidad × 2 unidades (marco)
    const v1 = html.slice(0, html.indexOf('<section', html.indexOf('<section') + 1))
    expect(count(text(v1), 'Tornillo autoperforante 3,9 × 19')).toBe(1)
    expect(text(v1)).toContain('36 u')
  })

  it('muestra avisos de fabricación (no los de precio) y vidrios sin redondear hacia arriba', () => {
    // Los avisos de precio van en Costos y Materiales: en la hoja de fabricación solo distraen.
    expect(plain).not.toContain('El limitador de apertura no tiene precio')
    const fabrication = { level: 'warn' as const, code: 'hardware_out_of_range', message: 'La cremona no cubre esta altura de hoja.' }
    const withWarning = { ...data, windows: data.windows.map((w, i) => (i === 0 ? { ...w, bom: { ...w.bom, warnings: [...w.bom.warnings, fabrication] } } : w)) }
    expect(text(renderToStaticMarkup(<WorkOrderDocument data={withWarning} />))).toContain('La cremona no cubre esta altura de hoja.')
    expect(plain).toContain('603,5 × 917,0')
    expect(plain).not.toMatch(/604(,0)? ×/)
  })

  it('une cortes idénticos de hojas distintas en una fila', () => {
    const v3 = text(renderToStaticMarkup(<WorkOrderDocument data={data} refs={['V3']} />))
    expect(count(v3, 'Hoja corredera 80')).toBe(2) // arriba·abajo e izquierda·derecha
    expect(v3).toContain('M05 · M06 · M09 · M10')
    expect(v3).toContain('4 × 2')
  })

  it('repite el título de cortes con la ventana en cada página impresa', () => {
    expect(html).toContain('class="fzw-thead-title"')
    expect(plain).toContain('V1 · Cortes')
    expect(plain).toContain('Refuerzos · acero')
  })

  it('filtra ventanas por ref', () => {
    const one = renderToStaticMarkup(<WorkOrderDocument data={data} refs={['V3']} />)
    expect(count(one, 'class="fzw-sheet')).toBe(1)
    expect(text(one)).toContain('Ventana dormitorios')
  })
})

describe('Optimización de cortes', () => {
  const html = renderToStaticMarkup(<CutOptimizationDocument data={data} />)
  const plain = text(html)

  it('resumen por perfil y color', () => {
    expect(plain).toContain('Optimización de cortes')
    expect(plain).toContain('Sacar de bodega')
    expect(plain).toContain('Barras a sacar de bodega')
    expect(plain).toContain(`${data.optimization.totalBars}`)
    // Disco y despunte en el encabezado, con lo que ocupa el disco en inglete.
    expect(plain).toContain('Disco 4 mm')
    expect(plain).toContain('Despunte inicio 0 mm')
    expect(plain).toContain('A 45° el disco de 4 mm ocupa 5,7 mm')
    for (const g of data.optimization.groups) expect(plain).toContain(g.code)
  })

  it('cada barra dibuja sus piezas y las lista una a una con casilla, código y ángulos', () => {
    expect(count(html, 'class="fzw-bar-row"')).toBe(data.optimization.totalBars)
    expect(plain).toContain('V3-M01')
    expect(plain).toContain('1.481')
    const pieces = data.optimization.groups.reduce((s, g) => s + g.bars.reduce((t, b) => t + b.cuts.length, 0), 0)
    // Un polígono en la barra y otro en la silueta del corte de su fila.
    expect(count(html, '<polygon')).toBe(pieces * 2)
    expect(count(html, 'aria-label="Marcar cortada"')).toBe(pieces)
    expect(html).toMatch(/fill="url\(#fzw-hatch-[A-Za-z0-9_-]+\)"/)
    // Los ángulos raros se ven en la fila de la pieza.
    expect(plain).toContain('58,3°')
    // Blanco y negro: sin tintes por ventana.
    expect(html).not.toContain('#DCE3FA')
  })

  it('un grupo largo puede seguir en otra hoja al compactar: cada barra siguiente dice su perfil', () => {
    const groups = data.optimization.groups
    expect(count(html, 'data-fit-flow')).toBe(groups.length)
    expect(count(html, 'class="fzw-h fzw-bar-group-title"')).toBe(groups.length)
    const extra = groups.reduce((s, g) => s + Math.max(0, g.bars.length - 1), 0)
    expect(count(html, 'class="fzw-bar-cont"')).toBe(extra)
    const css = workshopCss()
    expect(css).toMatch(/\.fzw-bar-cont \{ display: none;/)
    expect(css).toMatch(/\.fzw-tighter \.fzw-bar-cont \{ display: inline; \}/)
    // Con la lista de piezas un perfil puede ocupar varias hojas: el grupo se parte entre barras, nunca dentro de una.
    expect(css).not.toMatch(/\.fzw-bar-group \{ break-inside/)
    expect(css).toMatch(/\.fzw-bar-row \{[^}]*break-inside: avoid/)
    expect(html).not.toContain('margin-top:7mm')
  })

  it('vista previa con tope de barras: dibuja las primeras y deja completos el resumen y los totales', () => {
    const total = data.optimization.groups.reduce((s, g) => s + g.bars.length, 0)
    const max = Math.max(1, total - 3)
    const out = renderToStaticMarkup(<CutOptimizationDocument data={data} maxBars={max} />)
    expect(count(out, 'class="fzw-bar-row"')).toBe(max)
    expect(text(out)).toContain('Sacar de bodega')
    expect(text(out)).toContain(`${data.optimization.totalBars}`)
    expect(count(renderToStaticMarkup(<CutOptimizationDocument data={data} maxBars={1} />), 'class="fzw-bar-row"')).toBe(1)
  })

  it('dibuja despuntes cuando existen', () => {
    const trimmed = sampleWorkshopData({ cut: { barLength: 6000, kerf: 3, trimStart: 15, trimEnd: 15, minReusable: 600 } })
    const out = renderToStaticMarkup(<CutOptimizationDocument data={trimmed} />)
    expect(text(out)).toContain('despunte 15 + 15 mm')
    expect(text(out)).toContain('Despunte inicio 15 mm')
    expect(text(out)).toContain('barra de 6.000 mm')
  })
})

describe('Pedido de vidrios', () => {
  it('agrupa por tipo con medidas exactas y casillas', () => {
    const html = renderToStaticMarkup(<GlassListDocument data={data} />)
    const plain = text(html)
    expect(plain).toContain('Pedido de vidrios')
    expect(plain).toContain('DVH 4+12+4 incoloro')
    expect(plain).toContain('DVH laminado 3+3 / 12 / 4')
    expect(plain).toContain('603,5')
    expect(plain).toContain('917,0')
    expect(plain).not.toMatch(/\b604\b/)
    expect(plain).toContain('V3 · Hoja izquierda')
    expect(plain).toContain('Trapecio')
    const pieces = data.glass.reduce((s, g) => s + g.qty, 0)
    expect(count(html, 'aria-label="Marcar pedido"')).toBe(data.glass.length)
    expect(plain).toContain(`Piezas ${pieces}`)
  })

  it('redondea hacia abajo al 0,5 mm y muestra la medida exacta', () => {
    const custom: WorkshopDocumentData = {
      ...data,
      glass: [{ glassId: 'dvh-4124', name: 'DVH 4+12+4 incoloro', width: 365.9, height: 767.4, qty: 2, area: 0.2808, refs: ['V9 · Hoja'] }],
    }
    const plain = text(renderToStaticMarkup(<GlassListDocument data={custom} />))
    expect(plain).toContain('365,5')
    expect(plain).toContain('767,0')
    expect(plain).toContain('exacto 365,9')
    expect(plain).not.toContain('366')
  })
})

describe('Materiales', () => {
  it('sin costos: lista para bodega sin precios', () => {
    const html = renderToStaticMarkup(<MaterialsDocument data={data} />)
    const plain = text(html)
    expect(plain).toContain('Lista de materiales')
    for (const t of ['Perfiles', 'Refuerzos', 'Herrajes', 'Accesorios e insumos', 'Vidrios']) expect(plain).toContain(t)
    expect(plain).toContain('barra')
    expect(plain).toContain('Winchester')
    expect(plain).not.toContain('$')
    expect(plain).toContain('envase de 1.000 u')
  })

  it('con envase dice cuánto se usa de verdad: «278 u = 1 caja de 1.000»', () => {
    const item = data.catalog!.items.find((i) => (i.packSize ?? 0) > 1)!
    const line = { group: 'accessory' as const, code: item.code, name: item.name, qty: 1, unit: 'caja', consumption: 278, consumptionUnit: 'u' }
    expect(lineDetail(data, line)).toBe(`278 u = 1 caja de ${item.packSize!.toLocaleString('de-DE')}`)
    expect(lineDetail(data, { ...line, qty: 2, consumption: 1278 })).toBe(`1.278 u = 2 cajas de ${item.packSize!.toLocaleString('de-DE')}`)
    // Sin envase y con compra redondeada: 6,68 cartuchos = 7 cartuchos.
    expect(lineDetail(data, { group: 'accessory', code: 'no-existe', name: 'Silicona', qty: 7, unit: 'cartucho', consumption: 6.68, consumptionUnit: 'cartucho' })).toBe(
      '6,68 cartuchos = 7 cartuchos',
    )
    expect(lineDetail(data, { group: 'accessory', code: 'no-existe', name: 'Felpa', qty: 12.4, unit: 'm', consumption: 12.4, consumptionUnit: 'm' })).toBe('')
    expect(unitPlural('par', 2)).toBe('pares')
    expect(unitPlural('u', 5)).toBe('u')
    expect(unitPlural('caja', 1)).toBe('caja')
    const html = renderToStaticMarkup(<MaterialsDocument data={{ ...data, materials: [line] }} />)
    expect(text(html)).toContain('278 u = 1 caja de')
  })

  it('con costos: precios, subtotales y aviso de artículos sin precio', () => {
    const html = renderToStaticMarkup(<MaterialsDocument data={data} showCosts />)
    const plain = text(html)
    expect(plain).toContain('Materiales con costos')
    expect(plain).toContain('$')
    expect(plain).toContain('Sin precio')
    expect(plain).toContain('Un artículo no tiene precio')
    expect(plain).toContain('Subtotal perfiles')
    const total = data.materials.reduce((s, l) => s + (l.total ?? 0), 0)
    expect(plain).toContain(`$${total.toLocaleString('de-DE')}`)
  })
})

describe('Listado de montaje', () => {
  const html = renderToStaticMarkup(<AssemblyChecklistDocument data={data} />)
  const plain = text(html)

  it('ficha por ventana con los 8 controles y firmas', () => {
    expect(plain).toContain('Listado de montaje')
    expect(count(html, '<article class="fzw-card"')).toBe(data.windows.length)
    for (const c of ['Sello interior', 'Sello exterior', 'Vidrio', 'Tornillos', 'Regulación', 'Manilla y cierre', 'Deflector y drenaje', 'Control de escuadra'])
      expect(plain).toContain(c)
    expect(count(plain, 'Armó')).toBe(data.windows.length)
    expect(count(plain, 'Controló')).toBe(data.windows.length)
  })

  it('adapta los controles a la tipología y a las unidades', () => {
    expect(plain).toContain('Regulación de carros') // corredera
    expect(plain).toContain('no aplica: no tiene hojas que abran') // paños fijos
    expect(plain).toContain('U1')
    expect(plain).toContain('U2')
  })

  it('con cientos de unidades: cuenta las hojas sin dibujarlas y la vista previa dibuja solo las primeras', () => {
    const many = { ...data, windows: data.windows.map((w, i) => (i === 0 ? { ...w, qty: 1000 } : w)) }
    const sheets = assemblyChecklistSheets(many)
    // 1.000 unidades en fichas de 8 = 125 fichas, más una por cada otra ventana con hasta 8 unidades.
    expect(sheets).toBe(Math.ceil((125 + data.windows.length - 1) / 2))
    expect(assemblyChecklistSheets(data)).toBe(count(html, 'class="fzw-sheet'))
    const out = renderToStaticMarkup(<AssemblyChecklistDocument data={many} maxSheets={3} />)
    expect(count(out, 'class="fzw-sheet')).toBe(3)
    expect(text(out)).toContain(`Hoja 3 de ${sheets}`)
  })
})

describe('Costos internos', () => {
  it('familias, ventanas, precio y margen', () => {
    const plain = text(renderToStaticMarkup(<CostDocument data={data} />))
    expect(plain).toContain('Costos internos')
    expect(plain).toContain('No compartir con el cliente')
    for (const f of ['Perfiles', 'Refuerzos', 'Herrajes', 'Vidrios', 'Accesorios e insumos']) expect(plain).toContain(f)
    for (const w of data.costs.perWindow) expect(plain).toContain(w.ref)
    expect(plain).toContain('Margen')
    expect(plain).toContain('Hay artículos sin precio')
    // La compra real tiene su propio nombre: nunca «Costo directo» ni «% del costo».
    expect(plain).toContain('Compra real de materiales')
    expect(plain).toContain('Total materiales')
    expect(plain).not.toMatch(/% del costo/)
    expect(count(plain, 'Costo directo')).toBe(1)
  })

  it('con la venta de la cotización: margen tras el descuento y margen con compra real', () => {
    const list = data.costs.perWindow.reduce((s, w) => s + w.unitPrice * w.qty, 0)
    const cost = Math.round(data.costs.perWindow.reduce((s, w) => s + w.unitCost * w.qty, 0))
    const discount = Math.round(list * 0.075)
    const sold = list - discount
    const marginPct = Math.round(((sold - cost) / sold) * 1000) / 10
    const labor = 100000
    const materials = { profiles: 300000, reinforcement: 80000, hardware: 90000, glass: 300000, accessories: 30000 }
    const waste = cost - labor - Object.values(materials).reduce((a, b) => a + b, 0)
    const sale = { subtotal: list, discountPct: 7.5, discount, extras: 225000, cost, marginPct, materials, waste, labor, install: 0 }
    const plain = text(renderToStaticMarkup(<CostDocument data={{ ...data, sale }} />))
    const money = (n: number) => `$${Math.round(n).toLocaleString('de-DE')}`
    expect(plain).toContain(`Venta neta ${money(sold)} tras 7,5 % de descuento`)
    expect(plain).toContain(`Margen ${marginPct.toFixed(1).replace('.', ',')} %`)
    expect(plain).toContain('Margen con compra real')
    const purchase = data.costs.total
    const real = ((sold - (purchase + labor)) / sold) * 100
    expect(plain).toContain(`${real.toFixed(1).replace('.', ',')} %`)
    expect(plain).toContain(`por barras completas y envases`)
    expect(plain).toContain('Descuento de la cotización (7,5 %)')
    expect(plain).toContain(`Costo directo: materiales ${money(cost - labor)} + mano de obra ${money(labor)} = ${money(cost)}`)
    expect(plain).toContain('($225.000: su costo no se conoce)')
    expect(count(plain, 'Costo directo')).toBe(2) // la tarjeta y su desglose: una sola definición
  })
})

describe('Etiquetas', () => {
  const labels = workshopLabels(data)

  it('una etiqueta por pieza física y por vidrio, con QR', () => {
    const pieces = data.windows.reduce((s, w) => s + w.qty * w.bom.cuts.reduce((t, c) => t + c.qty, 0), 0)
    const glass = data.windows.reduce((s, w) => s + w.qty * w.bom.glass.reduce((t, g) => t + g.qty, 0), 0)
    expect(labels).toHaveLength(pieces + glass)
    const html = renderToStaticMarkup(<LabelsDocument data={data} />)
    expect(count(html, 'class="fzw-label"')).toBe(labels.length)
    expect(count(html, 'class="fzw-sheet')).toBe(Math.ceil(labels.length / 10))
    expect(html).toContain('data-code="V2-M03"')
    expect(html).toContain('data-qr="FZ:OT38:V2-M03"')
    expect(html).toContain('data-qr="FZ:OT38:V3-M01:U2"')
    // Un solo trazado por QR (no un <rect> por tramo): con miles de etiquetas pesa la cuarta parte.
    expect(html).toMatch(/<svg[^>]*data-qr="FZ:OT38:V1-M01"[^>]*><rect [^>]*><\/rect><path d="M\d+ \d+h\d+v1h-\d+z[^"]*" fill="#000000"><\/path><\/svg>/)
    const plain = text(html)
    expect(plain).toContain('unidad 2 de 2')
    expect(plain).toContain('A601 · Marco 60 · Winchester')
  })

  it('se cuentan sin armarlas, igual que las que salen', () => {
    expect(workshopLabelCount(data)).toBe(labels.length)
    expect(workshopLabelCount(data, { includeGlass: false })).toBe(workshopLabels(data, { includeGlass: false }).length)
    const many = { ...data, windows: [{ ...data.windows[0]!, qty: 10_000 }] }
    expect(workshopLabelCount(many)).toBe(10_000 * workshopLabels({ ...many, windows: [{ ...many.windows[0]!, qty: 1 }] }).length)
  })

  it('vista previa con tope: las primeras etiquetas, aunque sean todas de una ventana con miles de unidades', () => {
    expect(workshopLabels(data, { limit: 5 })).toEqual(labels.slice(0, 5))
    const many = { ...data, windows: [{ ...data.windows[0]!, qty: 10_000 }] }
    const first = workshopLabels(many, { limit: 30 })
    expect(first).toHaveLength(30)
    // Las etiquetas de la muestra son las reales: «unidad 1 de 10000», con su QR por unidad.
    expect(first[0]?.units).toBe(10_000)
    const html = renderToStaticMarkup(<LabelsDocument data={many} limit={30} />)
    expect(count(html, 'class="fzw-label"')).toBe(30)
    expect(count(html, 'class="fzw-sheet')).toBe(3)
    expect(text(html)).toContain('unidad 1 de 10000')
  })

  it('formato rollo: una etiqueta por página de 100 × 50 mm', () => {
    const html = renderToStaticMarkup(<LabelsDocument data={data} format="roll" includeGlass={false} />)
    expect(html).toContain('size: 100mm 50mm')
    const pieces = workshopLabels(data, { includeGlass: false }).length
    expect(count(html, 'class="fzw-sheet')).toBe(pieces)
  })
})

describe('Órdenes de compra', () => {
  it('una orden por proveedor con neto, IVA y total', () => {
    const html = renderToStaticMarkup(<PurchaseOrderDocument data={data} />)
    const plain = text(html)
    expect(count(html, 'class="fzw-sheet')).toBe(data.purchaseOrders.length)
    expect(plain).toContain('OC N° 38-1')
    expect(plain).toContain('IVA 19')
    const first = data.purchaseOrders[0]!
    expect(plain).toContain(first.brandName)
    expect(plain).toContain(`$${Math.round(first.total * 1.19).toLocaleString('de-DE')}`)
    expect(plain).toContain('Por confirmar')
  })

  it('sin precios y filtrada por proveedor', () => {
    const html = renderToStaticMarkup(<PurchaseOrderDocument data={data} brandId="austral" showPrices={false} />)
    expect(count(html, 'class="fzw-sheet')).toBe(1)
    expect(text(html)).not.toContain('$')
  })

  it('usa el IVA de la organización si no se indica otro', () => {
    expect(text(renderToStaticMarkup(<PurchaseOrderDocument data={{ ...data, ivaPct: 10 }} />))).toContain('IVA 10 %')
    expect(text(renderToStaticMarkup(<PurchaseOrderDocument data={{ ...data, ivaPct: 10 }} ivaPct={16} />))).toContain('IVA 16 %')
  })

  it('los totales van una sola vez al final de la tabla (no se repiten en cada hoja impresa)', () => {
    expect(workshopCss()).toMatch(/\.fzw-table tfoot \{ display: table-row-group;/)
  })
})

describe('PDF del servidor = vista previa', () => {
  it('el documento por tipo respeta «Con precios», «Incluir vidrios» y el IVA', () => {
    const noPrices = text(renderToStaticMarkup(<WorkshopDocument kind="purchase" data={data} showPrices={false} />))
    expect(noPrices).not.toContain('$')
    expect(text(renderToStaticMarkup(<WorkshopDocument kind="purchase" data={data} ivaPct={12} />))).toContain('IVA 12 %')
    const withGlass = renderToStaticMarkup(<WorkshopDocument kind="labels" data={data} />)
    const noGlass = renderToStaticMarkup(<WorkshopDocument kind="labels" data={data} includeGlass={false} />)
    expect(count(withGlass, 'class="fzw-label"')).toBe(workshopLabels(data).length)
    expect(count(noGlass, 'class="fzw-label"')).toBe(workshopLabels(data, { includeGlass: false }).length)
    expect(count(noGlass, 'class="fzw-label"')).toBeLessThan(count(withGlass, 'class="fzw-label"'))
  })
})

describe('Pedido de vidrios: textos de apoyo', () => {
  it('la frase de sellos y separadores solo si se arma termopanel en el taller', () => {
    expect(text(renderToStaticMarkup(<GlassListDocument data={data} />))).not.toContain('sellos y separadores')
    const withSeals = { ...data, materials: [...data.materials, { group: 'accessory' as const, code: 'SEP-12', name: 'Separador de aluminio 12 mm', qty: 20, unit: 'm' }] }
    expect(hasInsulatedGlassSupplies(withSeals)).toBe(true)
    expect(hasInsulatedGlassSupplies({ materials: [{ group: 'accessory', code: 'B1', name: 'Burlete Sello Superior', qty: 3, unit: 'm' }] })).toBe(false)
    expect(text(renderToStaticMarkup(<GlassListDocument data={withSeals} />))).toContain('sellos y separadores del termopanel')
  })
})

describe('Documentos para proveedores', () => {
  it('no muestran cliente, obra ni fecha de entrega al cliente', () => {
    for (const html of [
      renderToStaticMarkup(<GlassListDocument data={data} />),
      renderToStaticMarkup(<PurchaseOrderDocument data={data} />),
    ]) {
      const plain = text(html)
      expect(plain).not.toContain('Pedro Soto')
      expect(plain).not.toContain('Casa Pérez')
      expect(plain).not.toContain('14-11-2026')
      expect(html).not.toContain('Casa Pérez')
    }
  })
})

describe('Todos los documentos', () => {
  it('se renderizan por tipo desde el catálogo de documentos', () => {
    for (const doc of WORKSHOP_DOCUMENTS) {
      const html = renderToStaticMarkup(<WorkshopDocument kind={doc.kind} data={data} paper="a4" />)
      expect(html).toContain(`data-document="${doc.kind}"`)
      expect(html).toContain('size: A4')
    }
  })

  it('no fallan con una OT vacía', () => {
    const empty = sampleWorkshopData({ windows: [] })
    for (const doc of WORKSHOP_DOCUMENTS) {
      expect(() => renderToStaticMarkup(<WorkshopDocument kind={doc.kind} data={empty} />)).not.toThrow()
    }
  })

  it('aplican el color del taller y el pie de página', () => {
    const html = renderToStaticMarkup(<GlassListDocument data={{ ...data, org: { name: 'Taller Uno', accent: '#0F5E5A' } }} />)
    expect(html).toContain('--fzw-accent: #0F5E5A')
    expect(html).toContain('OT N° 38 · Pedido de vidrios')
    expect(html).toContain('counter(pages)')
  })
})

describe('Hojas casi vacías', () => {
  it('el documento se marca para ajustar al imprimir (salvo etiquetas con su propia página)', () => {
    expect(renderToStaticMarkup(<WorkOrderDocument data={data} />)).toContain('data-fit=""')
    expect(renderToStaticMarkup(<LabelsDocument data={data} format="roll" />)).not.toContain('data-fit')
    expect(workshopCss()).toContain('.fzw-tight .fzw-table-cuts td')
  })

  it('el script del servidor es JavaScript válido y autocontenido', () => {
    expect(() => new Function(WORKSHOP_FIT_SCRIPT)).not.toThrow()
    expect(WORKSHOP_FIT_SCRIPT).not.toMatch(/__name|require\(/)
  })

  it('no hace nada sin navegador', () => {
    expect(() => fitWorkshopSheets(null)).not.toThrow()
  })
})

describe('Integración con el render a HTML/PDF', () => {
  it('produce un HTML autónomo con los estilos de taller', async () => {
    const { renderDocumentHtml } = await import('../../src/render')
    const html = renderDocumentHtml(<CutOptimizationDocument data={data} />, { title: 'Cortes OT 38' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>Cortes OT 38</title>')
    expect(html).toContain('.fzw-doc')
    expect(html).toContain('V3 · arr')
  })

  it('incluye el script de ajuste cuando se pide', async () => {
    const { renderDocumentHtml } = await import('../../src/render')
    const html = renderDocumentHtml(<WorkOrderDocument data={data} />, { title: 'OT 38', script: WORKSHOP_FIT_SCRIPT })
    expect(html).toContain('<script>(function(){var fit=')
    expect(html.indexOf('<script>')).toBeGreaterThan(html.indexOf('<body>'))
    expect(renderDocumentHtml(<WorkOrderDocument data={data} />, { title: 'x', script: 'a("</script>")' })).not.toContain('a("</script>")')
  })
})
