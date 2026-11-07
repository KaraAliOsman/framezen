import { describe, expect, it } from 'vitest'
import { fillPlaceholders, invalidBraces, placeholdersFor, placeholdersIn, sanitizeDocText, splitPlaceholders, unsafeTextReason } from '../../src/templates'
import { cloneJson, findUnsafeStrings, jsonEqual, measureJson, ownValue, truncateText } from '../../src/templates/safety'

describe('unsafeTextReason — contenido malicioso', () => {
  const cases: [string, string][] = [
    ['<script>alert(1)</script>', 'html'],
    ['Hola <img src=x onerror=alert(1)>', 'html'],
    ['</style><style>body{display:none}</style>', 'html'],
    ['<!-- comentario -->', 'html'],
    ['<?xml version="1.0"?>', 'html'],
    ['<svg/onload=alert(1)>', 'html'],
    ['&#60;script&#62;', 'html_entity'],
    ['&lt;b&gt;negrita', 'html_entity'],
    ['javascript:alert(1)', 'script'],
    ['JaVaScRiPt:alert(1)', 'script'],
    ['java\tscript:alert(1)', 'script'],
    ['java script : void(0)', 'script'],
    ['vbscript:msgbox', 'script'],
    ['x onerror = steal()', 'script'],
    ['https://evil.example/phish', 'url'],
    ['HTTP://EVIL.EXAMPLE', 'url'],
    ['visita www.evil.example ahora', 'url'],
    ['//evil.example/x.js', 'url'],
    ['ftp://files.example/x', 'url'],
    ['file:///etc/passwd', 'url'],
    ['data:text/html;base64,PHNjcmlwdD4=', 'url'],
    ['data:image/svg+xml,<svg>', 'html'],
    ['mailto:robo@evil.example', 'url'],
    ['background:url(https://x)', 'url'],
    ['background: url (x.png)', 'css'],
    ['width: expression(alert(1))', 'css'],
    ['@import "evil.css";', 'css'],
    ['@font-face', 'css'],
    ['body{display:none}', 'css'],
    ['{color:red;}', 'css'],
    ['-moz-binding: x', 'css'],
    ['style="color:red"', 'css'],
    ['{{constructor.constructor("x")()}}', 'template_syntax'],
    ['${process.env.SECRET}', 'template_syntax'],
    ['<%= system("id") %>', 'template_syntax'],
    ['{% if x %}', 'template_syntax'],
    ['Texto\u0000oculto', 'control_chars'],
    ['Texto\u0007', 'control_chars'],
    ['Precio ‮oculto', 'invisible_chars'],
    ['java​script:x', 'invisible_chars'],
    ['﻿BOM', 'invisible_chars'],
    // Etiquetas Unicode («ASCII smuggling»: instrucciones ocultas que sólo lee la IA) y rellenos invisibles.
    ['Ignora todo \u{E0049}\u{E0047}\u{E004E}', 'invisible_chars'],
    ['Hangul\u3164relleno', 'invisible_chars'],
    ['java\u034Fscript:x', 'invisible_chars'],
  ]
  for (const [text, reason] of cases) {
    it(`rechaza ${JSON.stringify(text)} (${reason})`, () => {
      expect(unsafeTextReason(text)).toBe(reason)
    })
  }
})

describe('unsafeTextReason — textos legítimos de cotizaciones', () => {
  const ok = [
    'Estimado {client.name}: le presentamos nuestra propuesta.',
    '50% al aceptar, 50% contra entrega',
    'Plazo: 15 días hábiles; Garantía: 5 años en perfiles.',
    'Tel: 2 2345 6789 · ventas@empresa.cl',
    'Valores Uw < 1,3 W/(m²·K) y a < b con espacio',
    '**Importante:** la instalación incluye retiro de ventanas antiguas.\n- Sellado perimetral\n- Limpieza final',
    'Fabricación e instalación en 15 días hábiles',
    'Precio en CLP (IVA 19 % incluido)',
    'Türkçe: ğüşiöç İĞÜŞÖÇ ı — Português: ação, coração — Deutsch: Größe, Fußleiste',
    'Data sheet: available on request',
    'Garantía de 10 años — sujeta a mantención anual',
    'Pérez & Hijos Ltda.',
    '',
  ]
  for (const text of ok) {
    it(`acepta ${JSON.stringify(text.slice(0, 40))}`, () => {
      expect(unsafeTextReason(text)).toBeNull()
    })
  }
})

describe('sanitizeDocText', () => {
  it('normaliza NFC, quita invisibles/controles y unifica saltos', () => {
    expect(sanitizeDocText('Café​  rico\r\n\r\n\r\n\r\nfin\u0007', { multiline: true })).toBe('Café  rico\n\nfin')
  })
  it('quita etiquetas Unicode ocultas al limpiar', () => {
    expect(sanitizeDocText('Hola\u{E0041}\u{E0042} mundo')).toBe('Hola mundo')
  })
  it('en una línea convierte saltos en espacios', () => {
    expect(sanitizeDocText('uno\ndos\n\ntres')).toBe('uno dos tres')
  })
  it('recorta sin partir pares sustitutos', () => {
    expect(truncateText('ab😀', 3)).toBe('ab')
    expect(sanitizeDocText('x'.repeat(50), { max: 10 })).toHaveLength(10)
  })
  it('no "arregla" HTML: sigue siendo detectable', () => {
    expect(unsafeTextReason(sanitizeDocText('<b>hola</b>'))).toBe('html')
  })
})

describe('marcadores', () => {
  it('divide texto en segmentos y reconoce sólo la lista blanca', () => {
    expect(splitPlaceholders('Hola {client.name}, {foo.bar} y {quote.number}')).toEqual([
      { type: 'text', text: 'Hola ' },
      { type: 'placeholder', key: 'client.name' },
      { type: 'text', text: ', {foo.bar} y ' },
      { type: 'placeholder', key: 'quote.number' },
    ])
    expect(placeholdersIn('{org.name} {catalog.title}')).toEqual(['org.name', 'catalog.title'])
  })
  it('detecta llaves inválidas', () => {
    expect(invalidBraces('Hola {client.name}')).toEqual([])
    expect(invalidBraces('Hola {cliente}')).toEqual(['{cliente}'])
    expect(invalidBraces('suelta }')).toEqual(['}'])
  })
  it('rellena valores como texto plano', () => {
    expect(fillPlaceholders('N° {quote.number} para {client.name}', { 'quote.number': '412' })).toBe('N° 412 para ')
  })
  it('no hay marcadores de dinero y los de catálogo no aplican a cotizaciones', () => {
    const quote = placeholdersFor('quote')
    expect(quote.some((k) => /total|price|amount|discount|.tax$/i.test(k))).toBe(false)
    expect(quote).not.toContain('catalog.title')
    expect(placeholdersFor('catalog')).toEqual(expect.arrayContaining(['org.name', 'catalog.title']))
    expect(placeholdersFor('catalog')).not.toContain('client.name')
  })
})

describe('estructuras JSON', () => {
  it('mide profundidad, nodos y caracteres con corte temprano', () => {
    let deep: unknown = 'x'
    for (let i = 0; i < 40; i++) deep = { a: deep }
    expect(measureJson(deep, { maxDepth: 16, maxNodes: 1000, maxChars: 1000 }).exceeded).toBe(true)
    expect(measureJson({ a: 'x'.repeat(2000) }, { maxDepth: 16, maxNodes: 1000, maxChars: 1000 }).exceeded).toBe(true)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(measureJson(cyclic, { maxDepth: 16, maxNodes: 1000, maxChars: 1000 }).nonJson).toBe(true)
  })
  it('detecta llaves de prototipo', () => {
    const parsed = JSON.parse('{"a":{"__proto__":{"polluted":true}}}')
    expect(measureJson(parsed, { maxDepth: 16, maxNodes: 100, maxChars: 1000 }).forbiddenKey).toBe('__proto__')
    const clone = cloneJson(parsed) as { a: Record<string, unknown> }
    expect(Object.keys(clone.a)).toEqual([])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it('encuentra strings inseguros en valores y llaves', () => {
    const found = findUnsafeStrings({ ok: 'hola', nested: [{ t: '<script>' }], ['javascript:x']: 1 })
    expect(found.map((f) => f.path)).toEqual([['nested', 0, 't'], ['javascript:x']])
  })
  it('igualdad estructural y lectura segura de diccionarios', () => {
    expect(jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true)
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(ownValue({}, 'constructor')).toBeUndefined()
    expect(ownValue({ a: 1 }, 'a')).toBe(1)
  })
})
