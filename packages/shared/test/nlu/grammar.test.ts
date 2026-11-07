/**
 * Gramática por comando en los 7 idiomas: cotización, ventanas, clientes, navegación, ajustes,
 * asistentes, memoria, estadísticas, catálogo, varias órdenes en una frase, vocativo, ambigüedad,
 * valores inválidos y contexto (cotización abierta o no).
 */
import { describe, expect, it } from 'vitest'
import type { Locale } from '../../src/i18n/locales'
import type { NluContext, NluParseResult } from '../../src/nlu'
import { HOME_CTX, makeNlu, QUOTE_CTX } from './fixtures'

const nlus = new Map<Locale, ReturnType<typeof makeNlu>>()
function parse(text: string, locale: Locale = 'es', ctx: NluContext = QUOTE_CTX): NluParseResult {
  let nlu = nlus.get(locale)
  if (!nlu) {
    nlu = makeNlu(locale)
    nlus.set(locale, nlu)
  }
  return nlu.parse(text, ctx)
}

function plan(text: string, locale: Locale = 'es', ctx: NluContext = QUOTE_CTX): [string, Record<string, unknown>][] {
  const r = parse(text, locale, ctx)
  expect(r.status, `${text} → ${r.status} ${JSON.stringify(r.ignored)} ${r.reply ?? ''}`).toBe('ready')
  return r.plan!.map((c) => [c.tool, c.args as Record<string, unknown>])
}

describe('ventanas', () => {
  it('agregar con todo: bicolor, vidrio, línea, ambiente, accesorios y apertura', () => {
    const [[tool, args]] = plan('agrega una oscilobatiente de 800x1200 nogal por fuera y blanco por dentro con termopanel, línea Euro 60, para el baño, con persiana motorizada y mosquitero enrollable, bisagras a la izquierda')
    expect(tool).toBe('add_window')
    expect(args).toMatchObject({
      typology: 'tilt_turn',
      width: 800,
      height: 1200,
      colorId: 'col-walnut',
      colorInId: 'col-white',
      glassId: 'gl-dvh',
      lineId: 'ln-euro',
      location: 'Baño',
      hinge: 'left',
      extras: { rollerShutter: { operation: 'motor' }, insectScreen: { type: 'roller' } },
    })
  })

  it('tipologías del mercado en varios idiomas', () => {
    const cases: [Locale, string, string][] = [
      ['es', 'agrega una corredera elevadora de 3 hojas 3000x2200', 'lift_slide_3'],
      ['es', 'agrega una plegable de 5 hojas 4000x2200', 'folding_5'],
      ['es', 'agrega una puerta balconera de 2 hojas 1400x2200', 'balcony_door_double'],
      ['es', 'agrega una puerta de acceso con fijos laterales 1600x2200', 'entrance_door_sidelights'],
      ['es', 'agrega un fijo + oscilobatiente + fijo 2400x1200', 'fixed_tilt_turn_fixed'],
      ['es', 'agrega una ventana redonda de 800x800', 'round'],
      ['es', 'agrega un arco rebajado de 1200x900', 'arch_segmental'],
      ['es', 'agrega una pivotante horizontal 1000x1000', 'pivot_h'],
      ['es', 'agrega una osciloparalela de 2 hojas 2400x2200', 'tilt_slide_2'],
      ['es', 'agrega una corredera monorriel 1500x1200', 'sliding_mono'],
      ['en', 'add a lift and slide door 3 panels 3000x2200', 'lift_slide_3'],
      ['en', 'add a 4 panel bifold door 3000x2200', 'folding_4'],
      ['de', 'füge eine Hebeschiebetür mit 2 Flügeln 2500x2200 hinzu', 'lift_slide_2'],
      ['fr', 'ajoute un oscillo-battant 800x1200', 'tilt_turn'],
      ['it', 'aggiungi una anta-ribalta 800x1200', 'tilt_turn'],
      ['pt', 'adicione uma maxim-ar 600x500', 'awning'],
      ['tr', '800x1200 çift açılım pencere ekle', 'tilt_turn'],
    ]
    for (const [locale, text, typology] of cases) expect(plan(text, locale)[0][1], text).toMatchObject({ typology })
  })

  it('agregar sin cotización abierta crea una nueva primero (visible); el atajo sin verbo pide la cotización', () => {
    const r = parse('agrega una corredera 1500x1200', 'es', HOME_CTX)
    expect(r.status).toBe('ready')
    expect(r.plan!.map((c) => c.tool)).toEqual(['create_quote', 'add_window'])
    expect(r.assumptions.join(' ')).toMatch(/creo una nueva/)
    const short = parse('corredera 1500x1200', 'es', HOME_CTX)
    expect(short.status).toBe('incomplete')
    expect(short.missing[0].kind).toBe('quote')
    expect(short.repairs[0].text).toMatch(/^agrega corredera 1500x1200/)
  })

  it('una «ventana» con medidas usa el tipo por defecto del catálogo (supuesto visible); sin medidas pregunta con opciones', () => {
    const r = parse('quiero una ventana de 1200x1000')
    expect(r.status).toBe('ready')
    expect(r.plan![0].args).not.toHaveProperty('typology')
    expect(r.assumptions.join(' ')).toMatch(/por defecto/)
    const bare = parse('agrega una ventana')
    expect(bare.status).toBe('incomplete')
    expect(bare.missing[0].kind).toBe('typology')
    expect(bare.missing[0].choices!.map((c) => c.id)).toContain('sliding_2')
    const fold = parse('agrega una plegable 3000x2200')
    expect(fold.missing[0].kind).toBe('panels')
    expect(fold.missing[0].choices!.map((c) => c.id)).toEqual(['folding_3', 'folding_4', 'folding_5', 'folding_6', 'folding_7'])
  })

  it('cambios: masivos, rango, varias, medidas sueltas, apertura, accesorios, tipología por paño', () => {
    expect(plan('todas en nogal')[0][1]).toMatchObject({ all: true, colorId: 'col-walnut' })
    expect(plan('de la V1 a la V3 con laminado')[0][1]).toMatchObject({ items: ['V1', 'V2', 'V3'], glassId: 'gl-lam' })
    expect(plan('ancho 1800 en la V1')[0][1]).toMatchObject({ ref: 'V1', width: 1800 })
    expect(plan('que la V2 abra hacia afuera')[0][1]).toMatchObject({ ref: 'V2', direction: 'out' })
    expect(plan('quita el mosquitero de la V2')[0][1]).toMatchObject({ ref: 'V2', extras: { insectScreen: null } })
    expect(plan('el paño 2 de la V1 oscilobatiente')[0][1]).toMatchObject({ ref: 'V1', pane: 2, opening: 'tilt_turn' })
    expect(plan('cambia la V1 a 3 hojas')[0][1]).toMatchObject({ ref: 'V1', typology: 'sliding_3' })
    expect(plan('renombra la V2 a Dormitorio')[0][1]).toMatchObject({ ref: 'V2', location: 'Dormitorio' })
    expect(plan('change V2 to walnut', 'en')[0][1]).toMatchObject({ ref: 'V2', colorId: 'col-walnut' })
    expect(plan('mets la V3 en noyer', 'fr')[0][1]).toMatchObject({ ref: 'V3', colorId: 'col-walnut' })
  })

  it('sin destino usa la seleccionada; si hay varias y ninguna seleccionada, pregunta cuál', () => {
    expect(plan('ponle termopanel', 'es', { ...QUOTE_CTX, selectedRef: 'V3' })[0][1]).toMatchObject({ ref: 'V3', glassId: 'gl-dvh' })
    const r = parse('ponle termopanel')
    expect(r.status).toBe('incomplete')
    expect(r.missing[0].kind).toBe('item')
    expect(r.missing[0].choices!.map((c) => c.insertText.trim())).toContain('V2')
  })

  it('referencias inexistentes y cotización vacía', () => {
    const r = parse('duplica la V9')
    expect(r.status).toBe('invalid')
    expect(r.reply).toMatch(/V9/)
    expect(parse('borra la V1', 'es', { ...QUOTE_CTX, items: [] }).status).toBe('invalid')
  })

  it('duplicar con copias, otra igual, seleccionar', () => {
    expect(plan('copia la V3 dos veces')[0]).toEqual(['duplicate_window', { ref: 'V3', copies: 2 }])
    expect(plan('agrega una igual a la V1')[0]).toEqual(['duplicate_window', { ref: 'V1' }])
    expect(plan('ve a la V3')[0]).toEqual(['select_item', { ref: 'V3' }])
  })
})

describe('varias órdenes en una frase', () => {
  it('«agrega una V3 y ponle nogal»: dos cláusulas, el cambio va en la ventana nueva', () => {
    const r = parse('agrega una corredera de 1500x1200 y ponle nogal')
    expect(r.status).toBe('ready')
    expect(r.plan).toHaveLength(1)
    expect(r.plan![0].args).toMatchObject({ typology: 'sliding_2', colorId: 'col-walnut' })
    const v3 = parse('agrega una V3 y ponle nogal')
    expect(v3.status).toBe('incomplete')
    expect(v3.missing[0].kind).toBe('typology')
    expect(v3.summary).toMatch(/Nogal/)
  })

  it('varias ventanas, ventana y descuento, cambio y envío', () => {
    expect(plan('agrega una corredera de 1500x1200, una oscilobatiente de 60x120 y una puerta de 90x210').map(([, a]) => a.typology)).toEqual(['sliding_2', 'tilt_turn', 'door'])
    expect(plan('agrega una corredera de 1500x1200 y descuento 5%').map(([t]) => t)).toEqual(['add_window', 'set_discount'])
    expect(plan('cambia la V2 a nogal y envía la cotización por correo').map(([t]) => t)).toEqual(['update_window', 'send_quote'])
    expect(plan('füge ein Festfenster 1000x1000 hinzu und sende das Angebot per E-Mail', 'de').map(([t]) => t)).toEqual(['add_window', 'send_quote'])
  })

  it('una parte inválida o sin entender bloquea todo el plan (no se ejecuta a medias)', () => {
    expect(parse('agrega una corredera de 1500x1200 y descuento de 20.000').status).toBe('invalid')
    expect(parse('agrega una corredera de 1500x1200 y escribe un poema').status).toBe('unmatched')
  })

  it('recuerda que…: el resto es texto libre aunque tenga «y» o verbos', () => {
    const [[tool, args]] = plan('recuerda que el cliente Pérez paga a 30 días y prefiere nogal')
    expect(tool).toBe('remember')
    expect(args.content).toBe('el cliente Pérez paga a 30 días y prefiere nogal')
  })
})

describe('vocativo con nombres de asistentes («marco» también es el marco de la ventana)', () => {
  it('nombre + pausa o verbo se ignora', () => {
    expect(plan('Marco, agrega una oscilobatiente de 800x1200')[0][1]).toMatchObject({ typology: 'tilt_turn' })
    expect(plan('Sofía agrega una corredera 1500x1200')[0][1]).toMatchObject({ typology: 'sliding_2' })
    expect(plan('hola Marco: descuento 10%')[0]).toEqual(['set_discount', { percent: 10 }])
    expect(plan('ponle nogal a la V2, Sofía')[0][1]).toMatchObject({ ref: 'V2', colorId: 'col-walnut' })
  })

  it('«marco nogal» y «cambia el marco a nogal» hablan del marco', () => {
    expect(plan('marco nogal', 'es', { ...QUOTE_CTX, selectedRef: 'V2' })[0][1]).toMatchObject({ ref: 'V2', colorId: 'col-walnut' })
    expect(plan('Marco, cambia el marco de la V1 a nogal')[0][1]).toMatchObject({ ref: 'V1', colorId: 'col-walnut' })
  })

  it('solo el nombre o un saludo: respuesta local', () => {
    expect(parse('Sofía').status).toBe('answer')
    expect(parse('hola Marco').command).toBe('greeting')
    expect(parse('Sofía ile konuş', 'tr').plan![0]).toMatchObject({ tool: 'switch_assistant', args: { assistantId: 'as-sofia' } })
  })
})

describe('cotización', () => {
  it('crear con título y cliente, con ventanas', () => {
    expect(plan('nueva cotización llamada Casa Lo Barnechea para María Soto')[0]).toEqual(['create_quote', { title: 'Casa Lo Barnechea', clientId: 'cl-maria', client: 'María Soto' }])
    expect(plan('nueva cotización para Juan Pérez')[0]).toEqual(['create_quote', { client: 'Juan Pérez' }])
    expect(plan('nueva cotización con una corredera de 1500x1200').map(([t]) => t)).toEqual(['create_quote', 'add_window'])
    expect(plan('new quote for "Ana Ruiz"', 'en')[0]).toEqual(['create_quote', { clientId: 'cl-ana', client: 'Ana Ruiz' }])
  })

  it('abrir por número, título, última, o la de un cliente', () => {
    expect(plan('abre la cotización 412')[0]).toEqual(['open_quote', { number: 412 }])
    expect(plan('abre la última cotización')[0]).toEqual(['open_quote', { quoteId: 'q-open' }])
    expect(plan('abre la última cotización', 'es', HOME_CTX)[0]).toEqual(['open_quote', { quoteId: 'q-open', number: 130 }])
    expect(plan('abre la cotización de Edificio Norte')[0][1]).toMatchObject({ quoteId: 'q124' })
    expect(plan('öffne Angebot 124', 'de')[0][1]).toMatchObject({ quoteId: 'q124', number: 124 })
  })

  it('descuento y margen: porcentaje, monto (inválido), rango y quitar', () => {
    expect(plan('dale un 15% de descuento')[0]).toEqual(['set_discount', { percent: 15 }])
    expect(plan('descuento de 12')[0]).toEqual(['set_discount', { percent: 12 }])
    expect(plan('descuento diez por ciento')[0]).toEqual(['set_discount', { percent: 10 }])
    expect(plan('quita el descuento')[0]).toEqual(['set_discount', { percent: 0 }])
    expect(plan('Bu teklife %15 indirim uygula', 'tr')[0]).toEqual(['set_discount', { percent: 15 }])
    expect(plan('recargo sobre costo de 40%')[0]).toEqual(['set_margin', { percent: 40, mode: 'markup' }])
    for (const text of ['descuento de 20.000', 'descuento de $5000', 'descuento de 5 lucas']) {
      const r = parse(text)
      expect(r.status, text).toBe('invalid')
      expect(r.reply).toMatch(/porcentaje/)
    }
    expect(parse('margen de 120%').status).toBe('invalid')
    const r = parse('aplica un descuento')
    expect(r.status).toBe('incomplete')
    expect(r.missing[0].choices!.map((c) => c.insertText.trim())).toEqual(['5%', '10%', '15%'])
  })

  it('en otra cotización: el destino va en los argumentos', () => {
    expect(plan('descuento 10% en la cotización 124')[0]).toEqual(['set_discount', { quoteId: 'q124', number: 124, percent: 10 }])
  })

  it('cliente: asignar, quitar, coincidencia por apellido, nombre nuevo, varios homónimos', () => {
    expect(plan('asigna el cliente Soto')[0][1]).toMatchObject({ clientId: 'cl-maria' })
    expect(parse('asigna el cliente Soto').assumptions.join(' ')).toMatch(/Soto/)
    expect(plan('quita el cliente')[0]).toEqual(['set_client', { clear: true }])
    expect(plan('asigna el cliente Pedro Rojas')[0][1]).toEqual({ name: 'Pedro Rojas' })
    expect(plan('asigna el cliente Ana')[0][1]).toMatchObject({ clientId: 'cl-ana', name: 'Ana Ruiz' })
    expect(plan('asigna el cliente "Ana Ruiz"')[0][1]).toMatchObject({ clientId: 'cl-ana' })
  })

  it('notas, plantilla, idioma del documento, estado, documentos, taller, envío por WhatsApp', () => {
    expect(plan('agrega una nota: instalar en marzo, con andamio')[0]).toEqual(['set_quote_notes', { text: 'instalar en marzo, con andamio' }])
    expect(plan('cambia la plantilla a Luz')[0]).toEqual(['set_quote_template', { templateId: 'tpl-luz', template: 'Luz' }])
    expect(plan('el documento en inglés')[0]).toEqual(['set_quote_locale', { locale: 'en' }])
    expect(plan('márcala como aceptada')[0]).toEqual(['set_quote_status', { quoteId: 'q-open', status: 'accepted' }])
    expect(plan('muéstrame la vista previa')[0]).toEqual(['show_document', { view: 'document' }])
    expect(plan('vuelve al diseño')[0]).toEqual(['show_document', { view: 'design' }])
    expect(plan('comparte el enlace')[0]).toEqual(['share_quote_link', { quoteId: 'q-open' }])
    expect(plan('pasa esta cotización a taller')[0]).toEqual(['create_work_order', { quoteId: 'q-open' }])
    expect(plan('mándasela por whatsapp al +56 9 8765 4321')[0]).toEqual(['send_quote', { quoteId: 'q-open', channel: 'whatsapp', to: '+56 9 8765 4321' }])
    expect(plan('envíala en inglés por correo').map(([t]) => t)).toEqual(['set_quote_locale', 'send_quote'])
    expect(plan('¿por qué sale tan cara?')[0]).toEqual(['explain_price', {}])
    expect(plan('duplica esta cotización')[0]).toEqual(['duplicate_quote', { quoteId: 'q-open' }])
    expect(parse('elimina esta cotización').risk).toBe('destructive')
  })

  it('sin cotización abierta: pide cuál con las recientes', () => {
    const r = parse('descuento 10%', 'es', HOME_CTX)
    expect(r.status).toBe('incomplete')
    expect(r.missing[0].kind).toBe('quote')
    expect(r.missing[0].choices!.map((c) => c.insertText.trim())).toContain('#124')
  })
})

describe('clientes, búsqueda y navegación', () => {
  it('clientes', () => {
    expect(plan('crea un cliente "Pedro Rojas", correo pedro@example.com, rut 12.345.678-9')[0]).toEqual(['create_client', { name: 'Pedro Rojas', email: 'pedro@example.com', rut: '12.345.678-9' }])
    expect(plan('crea un cliente')[0]).toEqual(['open_dialog', { dialog: 'new_client' }])
    expect(plan('abre el cliente María Soto')[0]).toEqual(['open_client', { clientId: 'cl-maria' }])
    expect(plan('busca a Pérez')[0]).toEqual(['search', { query: 'Pérez', kind: 'clients' }])
    expect(plan('busca la cotización de los Pérez')[0]).toEqual(['search', { query: 'Pérez', kind: 'quotes' }])
  })

  it('navegación a cada sección en varios idiomas', () => {
    const cases: [Locale, string, Record<string, unknown>][] = [
      ['es', 've a clientes', { to: 'clients' }],
      ['es', 'catálogo', { to: 'catalog' }],
      ['es', 'abre los ajustes de precios', { to: 'pricing' }],
      ['es', 've a idioma y región', { to: 'settings', section: 'idioma' }],
      ['es', 'llévame a mis texturas', { to: 'catalog', section: 'colores' }],
      ['es', 've al inicio', { to: 'home' }],
      ['en', 'go to quotes', { to: 'quotes' }],
      ['pt', 'vá para a produção', { to: 'workshop' }],
      ['fr', 'va aux documents', { to: 'documents' }],
      ['de', 'gehe zu den Einstellungen', { to: 'settings' }],
      ['it', 'vai al team', { to: 'team' }],
      ['tr', 'kataloğa git', { to: 'catalog' }],
    ]
    for (const [locale, text, args] of cases) expect(plan(text, locale, HOME_CTX)[0], text).toEqual(['navigate', args])
  })

  it('formularios', () => {
    expect(plan('importa la lista de precios')[0]).toEqual(['open_dialog', { dialog: 'import_prices' }])
    expect(plan('sube una textura')[0]).toEqual(['open_dialog', { dialog: 'texture_upload' }])
    expect(plan('crea un asistente')[0]).toEqual(['open_dialog', { dialog: 'assistant_editor' }])
    expect(plan('edita la plantilla Moderna')[0]).toEqual(['open_template_editor', { templateId: 'tpl-moderna' }])
  })
})

describe('ajustes, asistentes, memoria, deshacer', () => {
  it('idioma de la interfaz, idioma predeterminado de documentos, tema, moneda', () => {
    expect(plan('cambia el idioma a portugués')[0]).toEqual(['set_ui_locale', { locale: 'pt' }])
    expect(plan('switch the language to German', 'en')[0]).toEqual(['set_ui_locale', { locale: 'de' }])
    expect(plan('dili Türkçe olarak değiştir', 'tr')[0]).toEqual(['set_ui_locale', { locale: 'tr' }])
    expect(plan('idioma predeterminado de los documentos: francés')[0]).toEqual(['update_settings', { document_locale: 'fr' }])
    expect(plan('modo oscuro')[0]).toEqual(['set_theme', { theme: 'dark' }])
    expect(plan('dark mode', 'en')[0]).toEqual(['set_theme', { theme: 'dark' }])
    expect(plan('pon el tema claro')[0]).toEqual(['set_theme', { theme: 'light' }])
    expect(plan('cambia la moneda a dólares')[0]).toEqual(['update_settings', { currency: 'USD' }])
    const missing = parse('cambia el idioma')
    expect(missing.status).toBe('incomplete')
    expect(missing.missing[0].choices).toHaveLength(7)
  })

  it('asistentes: cambiar, modo, nueva conversación', () => {
    expect(plan('habla con Sofía')[0]).toEqual(['switch_assistant', { assistantId: 'as-sofia' }])
    expect(plan('modo supervisado')[0]).toEqual(['set_assistant_mode', { mode: 'supervised' }])
    expect(plan('pasa a acceso total')[0]).toEqual(['set_assistant_mode', { mode: 'full' }])
    expect(plan('switch to chat mode', 'en')[0]).toEqual(['set_assistant_mode', { mode: 'chat' }])
    expect(plan('nueva conversación')[0]).toEqual(['new_conversation', {}])
  })

  it('memoria y deshacer', () => {
    expect(plan('olvida que trabajamos con perfiles de 70 mm')[0]).toEqual(['forget', { query: 'trabajamos con perfiles de 70 mm' }])
    expect(plan('¿qué recuerdas?')[0]).toEqual(['recall', {}])
    expect(plan('deshacer')[0]).toEqual(['undo', {}])
    expect(plan('rehacer')[0]).toEqual(['redo', {}])
    expect(plan('undo that', 'en')[0]).toEqual(['undo', {}])
    expect(parse('recuerda que').status).toBe('incomplete')
  })
})

describe('respuestas deterministas', () => {
  it('estadísticas desde los datos de la pantalla (zona horaria del negocio)', () => {
    const r = parse('¿cuánto vendí el mes pasado?')
    expect(r.status).toBe('answer')
    expect(r.reply).toMatch(/2\.999\.999/)
    expect(parse('¿cuántas cotizaciones hice este mes?').reply).toMatch(/6 cotizaciones/)
    expect(parse('¿cuál es mi tasa de cierre este mes?').reply).toMatch(/60/)
    expect(parse('¿qué cotizaciones están pendientes?').reply).toMatch(/203/)
    expect(parse('¿cuál es la tipología más vendida?').reply).toMatch(/^Lo más vendido.*Corredera 2 hojas \(6\)/)
    expect(parse('¿cuántos clientes tengo?').reply).toBe('Tienes 4 clientes.')
    expect(parse('ventas de octubre').reply).toMatch(/2\.300\.000/)
    expect(parse('What is my close rate this month?', 'en').reply).toMatch(/60%/)
  })

  it('sin datos de estadísticas va a la IA (no inventa)', () => {
    expect(parse('¿cuánto vendí este mes?', 'es', { quoteOpen: true }).status).toBe('unmatched')
  })

  it('datos parciales: la respuesta lo dice', () => {
    const r = parse('¿cuánto vendí este mes?', 'es', { ...QUOTE_CTX, stats: { quotes: QUOTE_CTX.stats!.quotes, complete: false } })
    expect(r.reply).toMatch(/cargadas/)
  })

  it('catálogo', () => {
    expect(parse('¿qué colores tengo?').reply).toMatch(/Blanco.*Nogal/)
    expect(parse('¿qué vidrios hay?').reply).toMatch(/Laminado 3\+3/)
    expect(parse('¿tienes nogal?').reply).toMatch(/Sí/)
    expect(parse('¿tienes caoba?').reply).toMatch(/No encuentro/)
  })

  it('ayuda, saludos, gracias y «¿cómo…?» explican sin ejecutar', () => {
    expect(parse('ayuda').reply).toMatch(/créditos/)
    expect(parse('hola').status).toBe('answer')
    expect(parse('gracias').reply).toMatch(/nada/)
    const how = parse('¿cómo agrego una ventana?')
    expect(how.status).toBe('answer')
    expect(how.plan).toEqual([])
    expect(how.reply).toMatch(/agrega una corredera/)
  })

  it('las respuestas salen en el idioma de la interfaz', () => {
    expect(parse('help', 'en').reply).toMatch(/credits/)
    expect(parse('aide', 'fr').reply).toMatch(/crédits/)
    expect(makeNlu('de').parse('¿cuánto vendí este mes?', QUOTE_CTX).reply).toMatch(/haben Sie/)
  })
})

describe('resultado', () => {
  it('«Entendí: …», supuestos y riesgo del plan', () => {
    const r = parse('agrega 2 correderas de 1500x1200 nogal')
    expect(r.interpretation).toBe('Entendí: Agregar corredera 2 hojas · 1.500 × 1.200 mm · Nogal · 2 unidades')
    expect(r.risk).toBe('write')
    expect(parse('envía la cotización por correo').risk).toBe('external')
    expect(parse('ve a clientes').risk).toBe('read')
    expect(makeNlu('en').parse('agrega 2 correderas de 1500x1200 nogal', QUOTE_CTX).interpretation).toMatch(/^Got it: /)
  })

  it('una palabra desconocida en un comando claro: reparación sin esa palabra', () => {
    const r = parse('agrega una corredera de 1500x1200 blanca porfavorcito')
    expect(r.status).toBe('ambiguous')
    expect(r.plan).toBeNull()
    expect(r.repairs.some((x) => x.text === 'agrega una corredera de 1500x1200 blanca')).toBe(true)
  })

  it('ids únicos por llamada y spans con posiciones originales', () => {
    const a = parse('deshacer')
    const b = parse('deshacer')
    expect(a.plan![0].id).not.toBe(b.plan![0].id)
    const r = parse('ponle nogal a la V2')
    const span = r.spans.find((s) => s.concept === 'col.walnut')!
    expect('ponle nogal a la V2'.slice(span.start, span.end)).toBe('nogal')
  })
})

describe('frases cotidianas del taller (con pronombres pegados)', () => {
  it('título y precio de una ventana en lenguaje natural', () => {
    expect(plan('ponle de título Casa Pérez Concepción')[0]).toEqual(['set_title', { title: 'Casa Pérez Concepción' }])
    expect(plan('cámbiale el título a Casa Pérez Concepción')[0]).toEqual(['set_title', { title: 'Casa Pérez Concepción' }])
    for (const text of ['precio de la V1', 'dime el precio de la V1', '¿cuál es el precio de la V2?']) {
      const [[tool, args]] = plan(text)
      expect(tool, text).toBe('explain_price')
      expect(args.ref, text).toMatch(/^V[12]$/)
    }
  })

  it('compartir el enlace', () => {
    expect(plan('compárteme el link')[0][0]).toBe('share_quote_link')
  })

  it('una pregunta de precio sin ventana no se disfraza de comando', () => {
    expect(parse('el precio del acero en Chile').status).toBe('unmatched')
  })
})

describe('tipologías de taller y conjuntos (v7)', () => {
  const add = (text: string, locale: Parameters<typeof makeNlu>[0] = 'es') => makeNlu(locale).parse(text, QUOTE_CTX)
  const typology = (text: string, locale: Parameters<typeof makeNlu>[0] = 'es') => (add(text, locale).plan?.find((c) => c.tool === 'add_window')?.args as { typology?: string } | undefined)?.typology

  it.each([
    ['agrega una guillotina de 900 x 1500', 'vertical_sliding'],
    ['agrega una guillotina doble de 900 x 1500', 'vertical_sliding_double'],
    ['agrega una celosía de 600 x 400', 'louver_fixed'],
    ['agrega una puerta ciega de 900 x 2100', 'door_panel'],
    ['agrega una puerta con zócalo de 900 x 2100', 'door_zocalo'],
    ['agrega una puerta de 2 hojas con zócalo de 1600 x 2100', 'door_double_zocalo'],
    ['agrega una puerta que abre hacia afuera de 900 x 2100', 'door_out'],
    ['agrega una abatible con paño fijo inferior de 900 x 2100', 'casement_bottom_fixed'],
    ['agrega una abatible de 2 hojas con parante de 1500 x 1200', 'casement_double_mullion'],
    ['agrega una oscilobatiente con sobreluz de 900 x 2000', 'tilt_turn_transom'],
    ['agrega una proyectante con fijo abajo de 900 x 1500', 'awning_transom'],
    ['agrega un fijo con oscilante arriba de 900 x 1500', 'fixed_tilt'],
  ])('%s', (text, id) => {
    expect(typology(text)).toBe(id)
  })

  it('lo que ya existía sigue igual', () => {
    expect(typology('agrega una puerta de 900 x 2100')).toBe('door')
    expect(typology('agrega una oscilobatiente de 900 x 1200')).toBe('tilt_turn')
    expect(typology('agrega un fijo con proyectante abajo de 900 x 1500')).toBe('fixed_awning_bottom')
    expect(typology('agrega una abatible con sobreluz de 900 x 2000')).toBe('casement_transom')
  })

  it('un conjunto se agrega como conjunto, con sus paños y medidas', () => {
    expect(add('agrega un bow window de 5 paños de 700 por 1400').plan?.[0]).toMatchObject({ tool: 'add_assembly', args: { preset: 'bow', panes: 5, width: 700, height: 1400 } })
    expect(add('agrega dos ventanas unidas de 1000 por 1400').plan?.[0]).toMatchObject({ tool: 'add_assembly', args: { preset: 'coupled_2', width: 1000, height: 1400 } })
    expect(add('agrega tres ventanas unidas de 1000 por 1400').plan?.[0]).toMatchObject({ tool: 'add_assembly', args: { preset: 'coupled_3' } })
    expect(add('agrega 2 bay windows de 800 por 1400').plan?.[0]).toMatchObject({ tool: 'add_assembly', args: { preset: 'bay', qty: 2 } })
    expect(add('add a corner window 1200 x 1400', 'en').plan?.[0]).toMatchObject({ tool: 'add_assembly', args: { preset: 'corner_90' } })
    expect(add('füge ein Erkerfenster 800 x 1400 hinzu', 'de').plan?.[0]).toMatchObject({ tool: 'add_assembly', args: { preset: 'bay' } })
  })

  it('unir ventanas de la cotización', () => {
    expect(add('une la V1 con la V2').plan?.[0]).toMatchObject({ tool: 'join_windows', args: { items: ['V1', 'V2'] } })
    expect(add('acopla V1, V2 y V3').plan?.[0]).toMatchObject({ tool: 'join_windows', args: { items: ['V1', 'V2', 'V3'] } })
    expect(add('join V1 and V2', 'en').plan?.[0]).toMatchObject({ tool: 'join_windows', args: { items: ['V1', 'V2'] } })
    expect(add('kopple V1 und V2', 'de').plan?.[0]).toMatchObject({ tool: 'join_windows', args: { items: ['V1', 'V2'] } })
    expect(add('V1 ve V2 birleştir', 'tr').plan?.[0]).toMatchObject({ tool: 'join_windows', args: { items: ['V1', 'V2'] } })
    // Con una sola ventana falta la otra; con una que no existe, se dice.
    expect(add('une la V1').status).toBe('incomplete')
    expect(add('une la V1 con la V9').plan ?? []).toEqual([])
  })

  it('«une» y «una» no se confunden con artículos en otros idiomas', () => {
    expect(add('ajoute une fenêtre fixe 1500 x 1200', 'fr').plan?.[0]?.tool).toBe('add_window')
    expect(add('adicione uma janela fixa 1500 x 1200', 'pt').plan?.[0]?.tool).toBe('add_window')
    expect(add('agrega una ventana fija de 1500 x 1200').plan?.[0]?.tool).toBe('add_window')
  })
})
