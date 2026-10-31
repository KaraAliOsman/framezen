import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_TOOLS,
  ASSISTANT_TOOL_NAMES,
  TYPOLOGY_IDS,
  coerceToolArgs,
  creditsForTokens,
  detectTypology,
  foldSpanish,
  formatMillimeters,
  isUndoCommand,
  parseLocalCommand,
  parseNumberToken,
  parseSpokenSize,
  type AssistantToolCall,
  type LocalCommandContext,
} from '../src'

type Simple = { name: string; args: Record<string, unknown> }

function run(text: string, context: LocalCommandContext = { quoteOpen: true }): Simple[] {
  const result = parseLocalCommand(text, context)
  if (!('toolCalls' in result)) throw new Error(`Sin herramientas para «${text}»: ${result.reply}`)
  return result.toolCalls.map((c: AssistantToolCall) => ({ name: c.name, args: JSON.parse(c.arguments) }))
}

function one(text: string, context?: LocalCommandContext): Simple {
  const calls = run(text, context)
  expect(calls, `«${text}» debería dar una sola llamada`).toHaveLength(1)
  return calls[0]
}

describe('definiciones de herramientas', () => {
  it('declara todas las herramientas con JSON Schema estilo OpenAI', () => {
    expect(ASSISTANT_TOOLS.map((t) => t.function.name)).toEqual([...ASSISTANT_TOOL_NAMES])
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.type).toBe('function')
      expect(tool.function.description.length).toBeGreaterThan(10)
      expect(tool.function.parameters.type).toBe('object')
      for (const req of tool.function.parameters.required ?? []) expect(tool.function.parameters.properties).toHaveProperty(req)
    }
    const add = ASSISTANT_TOOLS.find((t) => t.function.name === 'add_window')!
    expect(add.function.parameters.properties?.typology.enum).toEqual(TYPOLOGY_IDS)
    expect(JSON.parse(JSON.stringify(ASSISTANT_TOOLS))).toEqual(ASSISTANT_TOOLS)
  })

  it('créditos: 1 por cada 1.000 tokens, mínimo 1', () => {
    expect(creditsForTokens(0)).toBe(1)
    expect(creditsForTokens(1)).toBe(1)
    expect(creditsForTokens(1000)).toBe(1)
    expect(creditsForTokens(1001)).toBe(2)
    expect(creditsForTokens(4321)).toBe(5)
    expect(creditsForTokens(Number.NaN)).toBe(1)
  })
})

describe('coerceToolArgs', () => {
  it('convierte números escritos como texto y descarta lo desconocido', () => {
    expect(coerceToolArgs('add_window', '{"typology":"sliding_2","width":"1.500","height":"1200 mm","qty":"2"}')).toEqual({
      typology: 'sliding_2',
      width: 1500,
      height: 1200,
      qty: 2,
    })
    expect(coerceToolArgs('update_window', { opening: 'puerta', hinge: 'left', items: 'V1, V3' })).toEqual({ hinge: 'left', items: ['V1', 'V3'] })
    expect(coerceToolArgs('set_discount', '{"percent":"150"}')).toEqual({ percent: 100 })
    expect(coerceToolArgs('navigate', '{"to":"Taller"}')).toEqual({ to: 'taller' })
  })

  it('nunca lanza con JSON roto', () => {
    expect(coerceToolArgs('search', '{roto')).toEqual({ query: '' })
    expect(coerceToolArgs('set_title', null)).toEqual({ title: '' })
  })
})

describe('texto y números', () => {
  it('pliega tildes conservando el largo', () => {
    const raw = 'Cotización N° 412 · Baño × Ñuñoa'
    const folded = foldSpanish(raw)
    expect(folded).toHaveLength(raw.length)
    expect(folded).toBe('cotizacion n° 412 · bano x nunoa')
  })

  it('lee números en formato chileno', () => {
    expect(parseNumberToken('1.500')).toBe(1500)
    expect(parseNumberToken('1,5')).toBe(1.5)
    expect(parseNumberToken('1.5')).toBe(1.5)
    expect(parseNumberToken('1,500')).toBe(1500)
    expect(parseNumberToken('dos')).toBe(2)
    expect(parseNumberToken('abc')).toBeNull()
    expect(formatMillimeters(1234.5)).toBe('1.234,5')
  })

  it('entiende medidas en mm, cm y m', () => {
    expect(parseSpokenSize('1500 x 1200')).toMatchObject({ width: 1500, height: 1200, notes: [] })
    expect(parseSpokenSize('1.500 × 1.200')).toMatchObject({ width: 1500, height: 1200 })
    expect(parseSpokenSize('60x120')).toMatchObject({ width: 600, height: 1200 })
    expect(parseSpokenSize('60x120').notes[0]).toMatch(/centímetros/)
    expect(parseSpokenSize('1,5 x 1,2 m')).toMatchObject({ width: 1500, height: 1200, notes: [] })
    expect(parseSpokenSize('1.5x1.2')).toMatchObject({ width: 1500, height: 1200 })
    expect(parseSpokenSize('150 x 120 cm')).toMatchObject({ width: 1500, height: 1200, notes: [] })
    expect(parseSpokenSize('1500 por 1200')).toMatchObject({ width: 1500, height: 1200 })
    expect(parseSpokenSize('1800 de ancho y 1300 de alto')).toMatchObject({ width: 1800, height: 1300 })
    expect(parseSpokenSize('ancho 90')).toMatchObject({ width: 900 })
    expect(parseSpokenSize('alto 2,1 m')).toMatchObject({ height: 2100 })
    expect(parseSpokenSize('una corredera de 1500')).toMatchObject({ width: 1500 })
    expect(parseSpokenSize('corredera de 3 hojas').width).toBeUndefined()
  })

  it('reconoce tipologías comunes', () => {
    const cases: [string, string][] = [
      ['corredera', 'sliding_2'],
      ['corredera de 3 hojas', 'sliding_3'],
      ['corredera 4 hojas', 'sliding_4'],
      ['corredera con fijo', 'sliding_2_fixed'],
      ['monorriel', 'sliding_mono'],
      ['corredera de tres rieles', 'sliding_3_rail'],
      ['oscilobatiente', 'tilt_turn'],
      ['oscilo batiente', 'tilt_turn'],
      ['fijo con oscilobatiente', 'fixed_tilt_turn'],
      ['abatible', 'casement'],
      ['abatible hacia afuera', 'casement_out'],
      ['abatible de dos hojas', 'casement_double'],
      ['fijo + abatible', 'fixed_casement'],
      ['abatible con sobreluz', 'casement_transom'],
      ['proyectante', 'awning'],
      ['fijo con proyectante', 'fixed_awning_bottom'],
      ['oscilante', 'tilt'],
      ['banderola', 'tilt'],
      ['paño fijo', 'fixed'],
      ['tres paños fijos', 'fixed_3'],
      ['puerta', 'door'],
      ['puerta balconera', 'door'],
      ['puerta doble', 'door_double'],
      ['puerta de 2 hojas', 'door_double'],
      ['puerta con fijo lateral', 'door_sidelight'],
      ['puerta con sobreluz', 'door_transom'],
      ['medio punto', 'arch'],
      ['trapecio', 'trapezoid'],
      ['triangular', 'triangle'],
    ]
    for (const [text, id] of cases) expect(detectTypology(text)?.id, text).toBe(id)
    expect(detectTypology('Marco, hola')).toBeNull()
  })
})

describe('parseLocalCommand · agregar ventanas', () => {
  it('«agrega una corredera de 1500 x 1200 blanca con termopanel»', () => {
    expect(one('agrega una corredera de 1500 x 1200 blanca con termopanel')).toEqual({
      name: 'add_window',
      args: { typology: 'sliding_2', width: 1500, height: 1200, color: 'blanco', glass: 'termopanel' },
    })
  })

  it('«dos oscilobatientes de 60x120» (centímetros, cantidad)', () => {
    const result = parseLocalCommand('dos oscilobatientes de 60x120', { quoteOpen: true })
    expect('toolCalls' in result && result.notes?.[0]).toMatch(/centímetros/)
    expect(one('dos oscilobatientes de 60x120')).toEqual({ name: 'add_window', args: { typology: 'tilt_turn', width: 600, height: 1200, qty: 2 } })
  })

  it('variantes de redacción', () => {
    expect(one('Agregar 3 ventanas correderas de 1.800 × 1.300 en nogal').args).toEqual({ typology: 'sliding_2', width: 1800, height: 1300, qty: 3, color: 'nogal' })
    expect(one('añade una puerta de 90 x 210 para la cocina').args).toEqual({ typology: 'door', width: 900, height: 2100, location: 'Cocina' })
    expect(one('una proyectante 600x500 con vidrio laminado para el baño').args).toEqual({ typology: 'awning', width: 600, height: 500, glass: 'laminado', location: 'Baño' })
    expect(one('pon un paño fijo de 1,2 x 1,5 m antracita').args).toEqual({ typology: 'fixed', width: 1200, height: 1500, color: 'antracita' })
    expect(one('corredera 2000x1500 dormitorio principal').args).toEqual({ typology: 'sliding_2', width: 2000, height: 1500, location: 'Dormitorio principal' })
    expect(one('necesito una corredera de 3 hojas de 2400 x 1200 con dvh 5+12+5').args).toEqual({ typology: 'sliding_3', width: 2400, height: 1200, glass: 'DVH 5+12+5' })
    expect(one('Marco, agrega una oscilobatiente de 800 x 1200 por favor').args).toEqual({ typology: 'tilt_turn', width: 800, height: 1200 })
    expect(one('quiero una ventana de 1200x1000').args).toEqual({ width: 1200, height: 1000 })
    expect(one('1500x1200').args).toEqual({ width: 1500, height: 1200 })
    expect(one('agrega una corredera').args).toEqual({ typology: 'sliding_2' })
    expect(one('agrega una abatible de 600 x 900 con low-e, línea PRO6004').args).toEqual({ typology: 'casement', width: 600, height: 900, glass: 'low-e', line: 'PRO6004' })
    expect(one('agrega una corredera serie 70 de 1500x1200').args).toMatchObject({ typology: 'sliding_2', line: 'Serie 70' })
  })

  it('bicolor: color exterior e interior', () => {
    expect(one('agrega una corredera de 1500x1200 nogal por fuera y blanco por dentro').args).toMatchObject({ color: 'nogal', color_in: 'blanco' })
    expect(one('agrega una oscilobatiente 800x1200 blanco por dentro y nogal por fuera').args).toMatchObject({ color: 'nogal', color_in: 'blanco' })
    expect(one('una corredera 1500x1200 bicolor antracita/blanco').args).toMatchObject({ color: 'antracita', color_in: 'blanco' })
  })

  it('usa los nombres del catálogo cuando vienen en el contexto', () => {
    const ctx = { quoteOpen: true, colors: ['Roble montaña', 'Blanco'], lines: ['PROSLD70'] }
    expect(one('agrega una corredera de 1500 x 1200 roble montaña en prosld70', ctx).args).toMatchObject({ color: 'Roble montaña', line: 'PROSLD70' })
  })

  it('varias ventanas en una frase', () => {
    const calls = run('agrega una corredera de 1500x1200, una oscilobatiente de 60x120 y una puerta de 90x210')
    expect(calls.map((c) => [c.name, c.args.typology, c.args.width, c.args.height])).toEqual([
      ['add_window', 'sliding_2', 1500, 1200],
      ['add_window', 'tilt_turn', 600, 1200],
      ['add_window', 'door', 900, 2100],
    ])
  })
})

describe('parseLocalCommand · cambiar, duplicar, quitar', () => {
  it('«duplica la V2»', () => {
    expect(one('duplica la V2')).toEqual({ name: 'duplicate_window', args: { ref: 'V2' } })
    expect(one('copia la v3 dos veces')).toEqual({ name: 'duplicate_window', args: { ref: 'V3', copies: 2 } })
    expect(one('otra igual')).toEqual({ name: 'duplicate_window', args: {} })
    expect(one('agrega una igual a la V1')).toEqual({ name: 'duplicate_window', args: { ref: 'V1' } })
  })

  it('«cambia todo a nogal»', () => {
    expect(one('cambia todo a nogal')).toEqual({ name: 'update_window', args: { all: true, color: 'nogal' } })
    expect(one('todas con termopanel')).toEqual({ name: 'update_window', args: { all: true, glass: 'termopanel' } })
    expect(one('pon todas las ventanas en antracita')).toEqual({ name: 'update_window', args: { all: true, color: 'antracita' } })
  })

  it('«ancho 1800 en la V1» y otras medidas', () => {
    expect(one('ancho 1800 en la V1')).toEqual({ name: 'update_window', args: { ref: 'V1', width: 1800 } })
    expect(one('la V2 de 1500 x 1300')).toEqual({ name: 'update_window', args: { ref: 'V2', width: 1500, height: 1300 } })
    expect(one('sube el alto a 1300')).toEqual({ name: 'update_window', args: { height: 1300 } })
    expect(one('V3 alto 2100')).toEqual({ name: 'update_window', args: { ref: 'V3', height: 2100 } })
    expect(one('ancho 90')).toEqual({ name: 'update_window', args: { width: 900 } })
  })

  it('color, vidrio, línea, cantidad y ambiente', () => {
    expect(one('cambia la V2 a nogal').args).toEqual({ ref: 'V2', color: 'nogal' })
    expect(one('la V3 con laminado').args).toEqual({ ref: 'V3', glass: 'laminado' })
    expect(one('V1 y V3 en blanco').args).toEqual({ items: ['V1', 'V3'], color: 'blanco' })
    expect(one('de la V1 a la V3 con termopanel').args).toEqual({ items: ['V1', 'V2', 'V3'], glass: 'termopanel' })
    expect(one('cantidad 4 en la V2').args).toEqual({ ref: 'V2', qty: 4 })
    expect(one('la V1 que sean 3').args).toEqual({ ref: 'V1', qty: 3 })
    expect(one('la V2 para el living').args).toEqual({ ref: 'V2', location: 'Living' })
    expect(one('cambia la V1 a línea PRO7005').args).toEqual({ ref: 'V1', line: 'PRO7005' })
    expect(one('ponle termopanel').args).toEqual({ glass: 'termopanel' })
    expect(one('en nogal').args).toEqual({ color: 'nogal' })
  })

  it('aperturas y tipología', () => {
    expect(one('que la V2 abra hacia afuera').args).toEqual({ ref: 'V2', direction: 'out' })
    expect(one('la V1 con bisagras a la izquierda').args).toEqual({ ref: 'V1', hinge: 'left' })
    expect(one('el paño 2 oscilobatiente en la V1').args).toEqual({ ref: 'V1', pane: 2, opening: 'tilt_turn' })
    expect(one('la hoja derecha abatible').args).toEqual({ pane: -1, opening: 'casement' })
    expect(one('cambia la V2 a corredera').args).toEqual({ ref: 'V2', typology: 'sliding_2' })
    expect(one('cámbiala a oscilobatiente').args).toEqual({ opening: 'tilt_turn' })
    expect(one('convierte la V4 en puerta doble').args).toEqual({ ref: 'V4', typology: 'door_double' })
  })

  it('quitar ventanas', () => {
    expect(one('borra la V3')).toEqual({ name: 'remove_window', args: { ref: 'V3' } })
    expect(one('elimina la V1 y la V2')).toEqual({ name: 'remove_window', args: { items: ['V1', 'V2'] } })
    expect(one('quita la última')).toEqual({ name: 'remove_window', args: { ref: '#-1' } })
    expect(one('elimina esta ventana')).toEqual({ name: 'remove_window', args: {} })
  })

  it('una referencia sin cambio pide el dato sin inventarlo', () => {
    const result = parseLocalCommand('cambia la V2', { quoteOpen: true })
    expect('reply' in result && result.reply).toMatch(/Qué le cambio/)
  })

  it('«corredera de 2 hojas» no confunde «2 hojas» con la V2', () => {
    expect(one('agrega una puerta 2 hojas de 1600 x 2100').args).toEqual({ typology: 'door_double', width: 1600, height: 2100 })
    expect(one('agrega una ventana 2 hojas 1200x1000').name).toBe('add_window')
  })
})

describe('parseLocalCommand · cotización', () => {
  it('descuentos', () => {
    expect(one('descuento 5%')).toEqual({ name: 'set_discount', args: { percent: 5 } })
    expect(one('Aplica 5 % de descuento')).toEqual({ name: 'set_discount', args: { percent: 5 } })
    expect(one('dale un 10% de descuento')).toEqual({ name: 'set_discount', args: { percent: 10 } })
    expect(one('descuento del 7,5')).toEqual({ name: 'set_discount', args: { percent: 7.5 } })
    expect(one('cinco por ciento de descuento')).toEqual({ name: 'set_discount', args: { percent: 5 } })
    expect(one('quita el descuento')).toEqual({ name: 'set_discount', args: { percent: 0 } })
    expect(one('sin descuento')).toEqual({ name: 'set_discount', args: { percent: 0 } })
    expect(one('aplica 8%')).toEqual({ name: 'set_discount', args: { percent: 8 } })
  })

  it('un monto en pesos o un número sobre 100 no se vuelve un descuento de 100 %: pregunta', () => {
    const amounts = [
      'descuento de 20.000',
      'descuento de 50000 pesos',
      'hazle un descuento de 15000',
      'aplica descuento de 20000',
      'descuento de $20.000',
      'descuento de 20 lucas',
      'descuento de 20 mil',
      'descuento de 5 mil pesos',
      'descuento de 1,500',
      'descuento de 150',
    ]
    for (const text of amounts) {
      const result = parseLocalCommand(text, { quoteOpen: true })
      expect('toolCalls' in result, `«${text}» no debería aplicar un descuento`).toBe(false)
      if (!('toolCalls' in result)) expect(result.reply, text).toMatch(/porcentaje.*monto en pesos.*%/)
    }
    for (const text of ['descuento 150%', 'aplica 150%', 'descuento de 20.000 %']) {
      const result = parseLocalCommand(text, { quoteOpen: true })
      expect('toolCalls' in result, `«${text}» no debería aplicar un descuento`).toBe(false)
      if (!('toolCalls' in result)) expect(result.reply, text).toMatch(/no puede pasar de 100 %/)
    }
    // Lo válido sigue igual, incluso en el límite.
    expect(one('descuento de 100')).toEqual({ name: 'set_discount', args: { percent: 100 } })
    expect(one('descuento de 12')).toEqual({ name: 'set_discount', args: { percent: 12 } })
    expect(one('descuento 12.5')).toEqual({ name: 'set_discount', args: { percent: 12.5 } })
    expect(one('descuento de veinte')).toEqual({ name: 'set_discount', args: { percent: 20 } })
    // Junto a otro cambio, la duda viaja como nota en vez de perderse.
    const mixed = parseLocalCommand('agrega una corredera de 1500x1200 y descuento de 20.000', { quoteOpen: true })
    expect('toolCalls' in mixed && mixed.toolCalls.map((c) => c.name)).toEqual(['add_window'])
    expect('toolCalls' in mixed && mixed.notes).toEqual([expect.stringMatching(/monto en pesos/)])
  })

  it('«abre la cotización 412»', () => {
    expect(one('abre la cotización 412')).toEqual({ name: 'open_quote', args: { number: 412 } })
    expect(one('cotización N° 38')).toEqual({ name: 'open_quote', args: { number: 38 } })
    expect(one('ve a la cot #77')).toEqual({ name: 'open_quote', args: { number: 77 } })
    expect(one('abre la cotización de los Pérez')).toEqual({ name: 'open_quote', args: { query: 'los Pérez' } })
  })

  it('cotización nueva, con cliente o título, y con ventanas', () => {
    expect(one('nueva cotización')).toEqual({ name: 'create_quote', args: {} })
    expect(one('crea una cotización para Juan Pérez')).toEqual({ name: 'create_quote', args: { client: 'Juan Pérez' } })
    expect(one('nueva cotización llamada Casa Rojas · Talca')).toEqual({ name: 'create_quote', args: { title: 'Casa Rojas · Talca' } })
    const calls = run('nueva cotización con una corredera de 1500x1200')
    expect(calls.map((c) => c.name)).toEqual(['create_quote', 'add_window'])
    expect(calls[1].args).toEqual({ typology: 'sliding_2', width: 1500, height: 1200 })
  })

  it('título y cliente conservan mayúsculas y tildes', () => {
    expect(one('título Casa Pérez · Concepción')).toEqual({ name: 'set_title', args: { title: 'Casa Pérez · Concepción' } })
    expect(one('cambia el título a «Edificio Los Álamos»')).toEqual({ name: 'set_title', args: { title: 'Edificio Los Álamos' } })
    expect(one('cliente María José Soto')).toEqual({ name: 'set_client', args: { name: 'María José Soto' } })
    expect(one('el cliente es Constructora Andes, correo compras@andes.cl')).toEqual({
      name: 'set_client',
      args: { name: 'Constructora Andes', email: 'compras@andes.cl' },
    })
    expect(one('a nombre de Pedro Soto')).toEqual({ name: 'set_client', args: { name: 'Pedro Soto' } })
    expect(one('quita el cliente')).toEqual({ name: 'set_client', args: { clear: true } })
  })

  it('precio, documento y envío', () => {
    expect(one('explica el precio de la V2')).toEqual({ name: 'explain_price', args: { ref: 'V2' } })
    expect(one('¿por qué la V1 sale tan cara?')).toEqual({ name: 'explain_price', args: { ref: 'V1' } })
    expect(one('de dónde sale el precio')).toEqual({ name: 'explain_price', args: {} })
    expect(one('cuánto cuesta la V3')).toEqual({ name: 'explain_price', args: { ref: 'V3' } })
    expect(one('muéstrame el documento')).toEqual({ name: 'show_document', args: { view: 'document' } })
    expect(one('ver vista previa')).toEqual({ name: 'show_document', args: { view: 'document' } })
    expect(one('vuelve al diseño')).toEqual({ name: 'show_document', args: { view: 'design' } })
    expect(one('envíasela por whatsapp')).toEqual({ name: 'send_quote', args: { channel: 'whatsapp' } })
    expect(one('manda la cotización a ana@correo.cl')).toEqual({ name: 'send_quote', args: { channel: 'email', to: 'ana@correo.cl' } })
  })

  it('órdenes combinadas', () => {
    const calls = run('agrega una corredera de 1500x1200 y aplica 5% de descuento')
    expect(calls.map((c) => c.name)).toEqual(['add_window', 'set_discount'])
    const more = run('duplica la V2 y cambia todo a nogal; descuento 3%')
    expect(more.map((c) => c.name)).toEqual(['duplicate_window', 'update_window', 'set_discount'])
    // «nogal por fuera y blanco por dentro» no se parte en dos órdenes.
    expect(run('agrega una corredera 1500x1200 nogal por fuera y blanco por dentro')).toHaveLength(1)
  })
})

describe('parseLocalCommand · navegación y búsqueda', () => {
  it('navega', () => {
    expect(one('ve al taller')).toEqual({ name: 'navigate', args: { to: 'taller' } })
    expect(one('llévame a clientes')).toEqual({ name: 'navigate', args: { to: 'clientes' } })
    expect(one('abre el catálogo')).toEqual({ name: 'navigate', args: { to: 'catalogo' } })
    expect(one('inicio')).toEqual({ name: 'navigate', args: { to: 'inicio' } })
    expect(one('ir a cotizaciones')).toEqual({ name: 'navigate', args: { to: 'cotizaciones' } })
    expect(one('abre los ajustes de precios')).toEqual({ name: 'navigate', args: { to: 'precios' } })
    expect(one('muéstrame mi plan')).toEqual({ name: 'navigate', args: { to: 'plan' } })
  })

  it('busca', () => {
    expect(one('busca a Pérez')).toEqual({ name: 'search', args: { query: 'Pérez', kind: 'all' } })
    expect(one('buscar cotizaciones de Concepción')).toEqual({ name: 'search', args: { query: 'Concepción', kind: 'quotes' } })
    expect(one('busca el cliente Soto')).toEqual({ name: 'search', args: { query: 'Soto', kind: 'clients' } })
  })
})

describe('parseLocalCommand · respuestas sin herramientas', () => {
  it('saluda, ayuda y no inventa cuando no entiende', () => {
    for (const text of ['hola', 'Hola Marco', '¿qué puedes hacer?', 'gracias', 'blablá xyz', '']) {
      const result = parseLocalCommand(text)
      expect('reply' in result, text).toBe(true)
    }
    const unknown = parseLocalCommand('el cielo está azul hoy')
    expect('reply' in unknown && unknown.reply).toMatch(/No te entendí/)
    expect('reply' in unknown && unknown.suggestions?.length).toBeGreaterThan(0)
  })

  it('reconoce pedidos de deshacer', () => {
    expect(isUndoCommand('deshacer')).toBe(true)
    expect(isUndoCommand('Deshazlo')).toBe(true)
    expect(isUndoCommand('vuelve atrás')).toBe(true)
    expect(isUndoCommand('deshacer la V2 y agregar otra')).toBe(false)
  })

  it('genera ids únicos por llamada', () => {
    const calls = run('agrega una corredera de 1500x1200 y descuento 5%')
    expect(new Set(calls.map((c) => c.name + calls.indexOf(c))).size).toBe(2)
    const raw = parseLocalCommand('agrega una corredera de 1500x1200 y descuento 5%')
    if ('toolCalls' in raw) expect(new Set(raw.toolCalls.map((c) => c.id)).size).toBe(2)
  })
})
