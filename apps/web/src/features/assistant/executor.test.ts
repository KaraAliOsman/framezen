import { describe, expect, it } from 'vitest'
import { collectLeaves, createDesign } from '@framezen/engine'
import { SAMPLE_DEFAULTS } from '@framezen/catalog'
import { parseLocalCommand, type AssistantToolCall } from '@framezen/shared'
import { createExecutor } from './executor'
import { fakeEditor, fakeWorld, type FakeWorld } from './testing'

const base = { ...SAMPLE_DEFAULTS }
const design = (typology: string, width = 1200, height = 1000, lineId: string = base.lineId) =>
  createDesign(typology, { lineId, width, height, colorId: base.colorId, glassId: base.glassId })

/** Interpreta la frase con el modo local y la ejecuta como lo haría el panel. */
async function say(world: FakeWorld, text: string) {
  const parsed = parseLocalCommand(text, { quoteOpen: Boolean(world.editor) })
  if (!('toolCalls' in parsed)) throw new Error(`sin herramientas: ${parsed.reply}`)
  return createExecutor(world.env).run(parsed.toolCalls)
}

const call = (name: string, args: object): AssistantToolCall => ({ id: `t-${name}`, name, arguments: JSON.stringify(args) })

describe('ejecutor de herramientas (puente simulado)', () => {
  it('«agrega una corredera de 1500 x 1200 blanca con termopanel» crea la ventana con línea corredera, color y DVH', async () => {
    const editor = fakeEditor()
    const world = fakeWorld({ editor })
    const [out] = await say(world, 'agrega una corredera de 1500 x 1200 blanca con termopanel')
    expect(out.ok).toBe(true)
    const item = editor.quote.items[0]
    expect(item.ref).toBe('V1')
    expect(item.design).toMatchObject({ lineId: 'serie-70-corredera', width: 1500, height: 1200, colorId: 'blanco', glassId: 'dvh-4-12-4' })
    expect(item.design.root.type).toBe('sliding')
    expect(editor.selected).toBe(item.id)
    expect(out.receipts[0].text).toBe('Agregué V1 · Corredera 2 hojas 1.500 × 1.200 mm')
    expect(out.result).toMatchObject({ ok: true, ref: 'V1', width: 1500, height: 1200 })
    expect((out.result.totals as { net: number }).net).toBeGreaterThan(0)
    // Deshacer la quita.
    expect(out.receipts[0].undo?.()).toBe(true)
    expect(editor.quote.items).toHaveLength(0)
  })

  it('«dos oscilobatientes de 60x120»: cantidad, centímetros y línea practicable', async () => {
    const editor = fakeEditor()
    const world = fakeWorld({ editor })
    const [out] = await say(world, 'dos oscilobatientes de 60x120 en nogal para el baño')
    const item = editor.quote.items[0]
    expect(item).toMatchObject({ qty: 2, location: 'Baño' })
    expect(item.design).toMatchObject({ lineId: 'serie-60', width: 600, height: 1200, colorId: 'nogal' })
    expect(out.receipts[0].text).toMatch(/V1 · Oscilobatiente 600 × 1\.200 mm · 2 u/)
  })

  it('sin medidas usa la medida estándar y lo dice', async () => {
    const editor = fakeEditor()
    const [out] = await say(fakeWorld({ editor }), 'agrega una puerta')
    expect(editor.quote.items[0].design.root).toBeTruthy()
    expect(out.notes.join(' ')).toMatch(/medida estándar/)
  })

  it('avisa (sin bloquear) si un color o vidrio no existe en el catálogo', async () => {
    const editor = fakeEditor()
    const [out] = await createExecutor(fakeWorld({ editor }).env).run([call('add_window', { typology: 'fixed', width: 800, height: 800, color: 'fucsia', glass: 'diamante' })])
    expect(out.ok).toBe(true)
    expect(editor.quote.items[0].design.colorId).toBe('blanco')
    expect(out.notes.join(' ')).toMatch(/fucsia/)
    expect(out.notes.join(' ')).toMatch(/diamante/)
  })

  it('«cambia todo a nogal» cambia todas y se deshace de una vez', async () => {
    const editor = fakeEditor()
    editor.bridge.addItem(design('fixed'))
    editor.bridge.addItem(design('sliding_2', 1500, 1200, 'serie-70-corredera'))
    const world = fakeWorld({ editor })
    const [out] = await say(world, 'cambia todo a nogal')
    expect(editor.quote.items.map((i) => i.design.colorId)).toEqual(['nogal', 'nogal'])
    expect(out.receipts[0].text).toBe('Cambié las dos ventanas: Nogal')
    out.receipts[0].undo?.()
    expect(editor.quote.items.map((i) => i.design.colorId)).toEqual(['blanco', 'blanco'])
  })

  it('«cambia todo a nogal» y luego «agrega una corredera»: la nueva sigue en nogal y con el termopanel de siempre', async () => {
    const editor = fakeEditor()
    editor.bridge.addItem(design('fixed'))
    editor.bridge.addItem(design('casement'))
    const world = fakeWorld({ editor })
    await say(world, 'cambia todo a nogal')
    await say(world, 'agrega una corredera de 1500 x 1200')
    const added = editor.quote.items[2]
    expect(added.design).toMatchObject({ colorId: 'nogal', glassId: 'dvh-4-12-4', lineId: 'serie-70-corredera' })
    // Con colores mezclados vuelve al color de tus ajustes.
    editor.bridge.updateDesign(editor.quote.items[0].id, (d) => ({ ...d, colorId: 'blanco' }))
    await say(world, 'agrega una puerta de 900 x 2100')
    expect(editor.quote.items[3].design.colorId).toBe(base.colorId)
  })

  it('«ancho 1800 en la V1», vidrio y línea', async () => {
    const editor = fakeEditor()
    editor.bridge.addItem(design('casement'))
    const world = fakeWorld({ editor })
    const [width] = await say(world, 'ancho 1800 en la V1')
    expect(editor.quote.items[0].design.width).toBe(1800)
    expect(width.receipts[0].text).toBe('Cambié V1: ancho 1.800 mm')
    await say(world, 'la V1 con laminado')
    expect(editor.quote.items[0].design.glassId).toBe('laminado-3-3')
    await say(world, 'cambia la V1 a línea serie puerta 70')
    expect(editor.quote.items[0].design.lineId).toBe('serie-puerta-70')
  })

  it('apertura de un paño, bisagras y cambio de tipología', async () => {
    const editor = fakeEditor()
    editor.bridge.addItem(design('fixed_casement', 1600, 1200))
    const world = fakeWorld({ editor })
    await say(world, 'el paño 1 oscilobatiente en la V1')
    const leaves = collectLeaves(editor.quote.items[0].design.root)
    expect(leaves[0].opening.kind).toBe('tilt_turn')
    await say(world, 'la V1 con bisagras a la derecha')
    expect(collectLeaves(editor.quote.items[0].design.root).filter((l) => l.opening.kind !== 'fixed').every((l) => l.opening.hinge === 'right')).toBe(true)
    const [typ] = await say(world, 'cambia la V1 a corredera')
    expect(editor.quote.items[0].design.root.type).toBe('sliding')
    expect(editor.quote.items[0].design.lineId).toBe('serie-70-corredera')
    expect(editor.quote.items[0].design.width).toBe(1600)
    expect(typ.receipts[0].text).toMatch(/ahora corredera 2 hojas/)
  })

  it('«duplica la V2» y «otra igual» usan la última ventana tocada', async () => {
    const editor = fakeEditor()
    editor.bridge.addItem(design('fixed'))
    editor.bridge.addItem(design('awning', 600, 500))
    const world = fakeWorld({ editor })
    const [dup] = await say(world, 'duplica la V2')
    expect(editor.quote.items.map((i) => i.ref)).toEqual(['V1', 'V2', 'V3'])
    expect(editor.quote.items[2].design).toEqual(editor.quote.items[1].design)
    expect(dup.receipts[0].text).toBe('Dupliqué V2 como V3')
    dup.receipts[0].undo?.()
    expect(editor.quote.items).toHaveLength(2)

    // En una misma orden: agregar y luego «otra igual» duplica la recién agregada.
    const outcomes = await say(world, 'agrega una corredera de 1500x1200 y otra igual')
    expect(outcomes.map((o) => o.ok)).toEqual([true, true])
    expect(editor.quote.items.slice(-2).map((i) => i.design.root.type)).toEqual(['sliding', 'sliding'])
  })

  it('quitar ventanas se puede deshacer', async () => {
    const editor = fakeEditor()
    editor.bridge.addItem(design('fixed'), { location: 'Living' })
    editor.bridge.addItem(design('casement'))
    editor.bridge.updateItem(editor.quote.items[0].id, { notes: 'ojo con el vano' })
    const [out] = await say(fakeWorld({ editor }), 'borra la V1')
    expect(editor.quote.items.map((i) => i.ref)).toEqual(['V2'])
    expect(out.receipts[0].text).toBe('Quité V1')
    out.receipts[0].undo?.()
    const restored = editor.quote.items.find((i) => i.ref === 'V1')
    expect(restored).toMatchObject({ location: 'Living', notes: 'ojo con el vano' })
  })

  it('descuento, título y deshacer', async () => {
    const editor = fakeEditor()
    editor.bridge.addItem(design('fixed'))
    const world = fakeWorld({ editor })
    const [discount] = await say(world, 'descuento 5%')
    expect(editor.quote.discountPct).toBe(5)
    expect(discount.receipts[0].text).toBe('Apliqué 5 % de descuento')
    expect(discount.say).toMatch(/El total queda en \$[\d.]+ \+ IVA/)
    expect((discount.result.totals as { discountPct: number }).discountPct).toBe(5)
    discount.receipts[0].undo?.()
    expect(editor.quote.discountPct).toBe(0)
    await say(world, 'título Casa Pérez · Concepción')
    expect(editor.quote.title).toBe('Casa Pérez · Concepción')
  })

  it('cliente: usa uno existente o lo crea', async () => {
    const editor = fakeEditor()
    const world = fakeWorld({ editor })
    const [found] = await say(world, 'cliente Juan Pérez')
    expect(editor.quote.clientId).toBe('c1')
    expect(found.receipts[0].text).toBe('Cliente: Juan Pérez')
    const [created] = await say(world, 'el cliente es Constructora Andes, correo compras@andes.cl')
    expect(world.clients.at(-1)).toMatchObject({ name: 'Constructora Andes', email: 'compras@andes.cl' })
    expect(created.receipts[0].text).toBe('Cliente: Constructora Andes (nuevo)')
    created.receipts[0].undo?.()
    expect(editor.quote.clientId).toBe('c1')
  })

  it('explica el precio con el motor (y sin costos si la persona no los ve)', async () => {
    const editor = fakeEditor()
    editor.bridge.addItem(design('fixed'))
    editor.bridge.addItem(design('sliding_2', 1500, 1200, 'serie-70-corredera'), { qty: 2 })
    const [out] = await say(fakeWorld({ editor }), 'explica el precio de la V2')
    expect(out.card?.kind).toBe('price')
    if (out.card?.kind !== 'price') return
    expect(out.card.ref).toBe('V2')
    expect(out.card.unitNet).toBeGreaterThan(0)
    expect(out.card.totalNet).toBe(out.card.unitNet * 2)
    expect(out.card.lines.some((l) => l.label === 'Perfiles')).toBe(true)
    expect(out.say).toMatch(/^V2 cuesta \$[\d.]+ \+ IVA por unidad/)
    expect(editor.selected).toBe(editor.quote.items[1].id)

    const [hidden] = await say(fakeWorld({ editor, canSeeCosts: false }), 'explica el precio de la V2')
    expect(hidden.card?.kind === 'price' && hidden.card.lines).toEqual([])
    expect(hidden.result).not.toHaveProperty('breakdown')
  })

  it('sin editor abierto: «agrega…» crea la cotización, la abre y espera al editor', async () => {
    const world = fakeWorld({ path: '/inicio' })
    const [out] = await say(world, 'agrega una corredera de 1500 x 1200')
    expect(out.ok).toBe(true)
    expect(world.navigated).toEqual(['/cotizaciones/q41'])
    expect(world.editor?.quote.items).toHaveLength(1)
    expect(out.receipts.map((r) => r.text)).toEqual(['Creé la cotización N° 41', 'Agregué V1 · Corredera 2 hojas 1.500 × 1.200 mm'])
  })

  it('sin editor: cambiar o descontar responde con una salida, sin lanzar', async () => {
    const world = fakeWorld({ path: '/inicio' })
    const [out] = await say(world, 'descuento 5%')
    expect(out.ok).toBe(false)
    expect(out.say).toMatch(/abre una cotización|nueva cotización/i)
    expect(world.navigated).toEqual([])
  })

  it('nueva cotización para un cliente, abrir por número, navegar y buscar', async () => {
    const world = fakeWorld({ path: '/inicio' })
    const [created] = await say(world, 'nueva cotización para Juan Pérez')
    expect(world.quotes[0]).toMatchObject({ clientId: 'c1' })
    expect(created.receipts[0].text).toBe('Creé la cotización N° 41 · Juan Pérez')

    const [opened] = await say(world, 'abre la cotización 41')
    expect(opened.say).toMatch(/N° 41/)
    expect(world.path).toBe('/cotizaciones/q41')
    const [missing] = await say(world, 'abre la cotización 999')
    expect(missing.ok).toBe(false)
    expect(missing.say).toMatch(/No encontré la cotización N° 999/)

    await say(world, 've al taller')
    expect(world.path).toBe('/taller')

    const [found] = await say(world, 'busca a Pérez')
    expect(found.card?.kind).toBe('results')
    expect(found.say).toMatch(/Encontré 1 cliente/)
  })

  it('enviar pide visto bueno: si dices que no, no envía', async () => {
    const editor = fakeEditor({ client: { id: 'c1', name: 'Juan Pérez', email: 'juan@correo.cl', createdAt: '', updatedAt: '' }, clientId: 'c1' })
    editor.bridge.addItem(design('fixed'))
    const world = fakeWorld({ editor })
    world.approveAnswer = false
    const [declined] = await say(world, 'envíasela por correo')
    expect(world.approvals[0]).toBe('¿Envío la cotización N° 7 a Juan Pérez?')
    expect(declined.ok).toBe(false)
    expect(world.sent).toHaveLength(0)

    world.approveAnswer = true
    const [sent] = await say(world, 'envíasela por correo')
    expect(world.sent).toEqual([{ id: 'q1', body: { channel: 'email', to: 'juan@correo.cl' } }])
    expect(sent.receipts[0].text).toBe('Envié la cotización N° 7 (versión A) a juan@correo.cl')
  })

  it('herramientas desconocidas o argumentos rotos no rompen nada', async () => {
    const editor = fakeEditor()
    const outcomes = await createExecutor(fakeWorld({ editor }).env).run([
      { id: 'x', name: 'borrar_todo', arguments: '{}' },
      { id: 'y', name: 'update_window', arguments: '{roto' },
      { id: 'z', name: 'add_window', arguments: '{"typology":"sliding_2","width":"1.500","height":"1200"}' },
    ])
    expect(outcomes.map((o) => o.ok)).toEqual([false, false, true])
    expect(outcomes[1].say).toMatch(/no tiene ventanas/)
    expect(editor.quote.items[0].design.width).toBe(1500)
  })

  it('se detiene si se cancela (lo hecho queda)', async () => {
    const editor = fakeEditor()
    const controller = new AbortController()
    const executor = createExecutor(fakeWorld({ editor }).env)
    const outcomes = await executor.run([call('add_window', { typology: 'fixed', width: 800, height: 800 }), call('set_discount', { percent: 5 })], {
      signal: controller.signal,
      onStep: (_c, outcome) => {
        if (outcome) controller.abort()
      },
    })
    expect(outcomes).toHaveLength(1)
    expect(editor.quote.items).toHaveLength(1)
    expect(editor.quote.discountPct).toBe(0)
  })
})
