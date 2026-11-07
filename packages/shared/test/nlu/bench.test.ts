/**
 * Rendimiento con 500 clientes + 500 cotizaciones (investigación 24 §7): `complete` < 2 ms por
 * pulsación y `parse` < 3 ms, medidos tras calentar (JIT, índices y cachés de cada idioma), con
 * márgenes amplios para CI: se exige la mediana bajo el objetivo y el p95 holgado (la suite completa corre en paralelo y mete ruido; lo real es ~0,15 ms).
 */
import { describe, expect, it } from 'vitest'
import { createNlu, type NluEntities } from '../../src/nlu'
import { CATALOG, GLOSSARY, QUOTE_CTX } from './fixtures'

const FIRST = ['María', 'Juan', 'Pedro', 'Ana', 'Luis', 'Carla', 'Diego', 'Sofía', 'Andrés', 'Valentina']
const LAST = ['Soto', 'Pérez', 'González', 'Muñoz', 'Rojas', 'Díaz', 'Silva', 'Torres', 'Vargas', 'Castro', 'Núñez', 'Fuentes']
const COMMUNES = ['Las Condes', 'Ñuñoa', 'Providencia', 'Maipú', 'La Reina', 'Vitacura', 'Peñalolén']

function bigEntities(): NluEntities {
  const clients = Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]} ${i}`, email: `cliente${i}@example.com` }))
  const quotes = Array.from({ length: 500 }, (_, i) => ({ id: `q${i}`, number: 1000 + i, title: `Obra ${COMMUNES[i % COMMUNES.length]} ${i}`, clientName: clients[i].name }))
  return { version: 'bench', clients, quotes, templates: [{ id: 't1', name: 'Moderna' }], assistants: [{ id: 'a1', name: 'Marco' }] }
}

const PHRASES = [
  'agrega 3 ventanas correderas de 2 hojas de 1500 por 1200 mm blancas con termopanel',
  'cambia el color de todos los ítems a gris antracita',
  'aplica un 10% de descuento a esta cotización',
  'abre la cotización 1234',
  'asigna el cliente María Soto 12',
  '¿cuánto vendí este mes?',
  'recuerda que el horario de atención es de lunes a viernes de 9 a 18',
  'Füge 3 weiße Schiebefenster mit 2 Flügeln, 1500 mal 1200 mm, mit Zweifachverglasung hinzu',
  '3 adet beyaz, çift camlı, 2 kanatlı, 1500 x 1200 mm sürme pencere ekle',
  'Envoie le devis #1123 à sa cliente par e-mail',
]

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  return { p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1] }
}

describe('rendimiento', () => {
  const entities = bigEntities()
  const buildStart = performance.now()
  const nlu = createNlu({ locale: 'es', glossary: GLOSSARY, catalog: CATALOG, entities, currency: 'CLP', timeZone: 'America/Santiago' })
  const buildMs = performance.now() - buildStart

  // Calentamiento: todas las frases, todos los prefijos, varios idiomas de entrada.
  for (let round = 0; round < 3; round++) {
    for (const p of PHRASES) {
      nlu.parse(`${p} ${round}`, QUOTE_CTX)
      for (let k = 1; k <= p.length; k += 3) nlu.complete(p.slice(0, k), k, QUOTE_CTX)
    }
  }

  it('construye los índices de 1000 entidades rápido y una sola vez por versión', () => {
    expect(buildMs).toBeLessThan(1500)
    const again = performance.now()
    createNlu({ locale: 'en', glossary: GLOSSARY, catalog: CATALOG, entities })
    expect(performance.now() - again).toBeLessThan(50)
  })

  it('complete: < 2 ms por pulsación (escritura completa de 10 frases)', () => {
    const samples: number[] = []
    for (let round = 0; round < 4; round++) {
      for (const p of PHRASES) {
        const text = round ? `${p} ${round}` : p
        for (let k = 1; k <= text.length; k++) {
          const t = performance.now()
          nlu.complete(text.slice(0, k), k, QUOTE_CTX)
          samples.push(performance.now() - t)
        }
      }
    }
    const s = stats(samples)
    expect(s.p50).toBeLessThan(2)
    expect(s.p95).toBeLessThan(12)
  })

  it('parse: < 3 ms por frase (textos distintos, sin caché)', () => {
    const samples: number[] = []
    for (let i = 0; i < 600; i++) {
      const text = `${PHRASES[i % PHRASES.length]} ${i}`
      const t = performance.now()
      nlu.parse(text, QUOTE_CTX)
      samples.push(performance.now() - t)
    }
    const s = stats(samples)
    expect(s.p50).toBeLessThan(3)
    expect(s.p95).toBeLessThan(18)
  })

  it('búsqueda de entidades por prefijo entre 500 clientes', () => {
    // Con 7 muestras el p95 era el máximo: una sola pausa del recolector o del sistema tumbaba la
    // prueba con la mediana en 0,2 ms. Se calienta esta ruta y se mide con muestras de verdad.
    const prefixes = ['Ma', 'Mar', 'Marí', 'Pé', 'Gonz', 'Sof', 'Val']
    const ask = (prefix: string) => nlu.complete(`asigna el cliente ${prefix}`, `asigna el cliente ${prefix}`.length, QUOTE_CTX)
    for (const prefix of prefixes) ask(prefix)
    const samples: number[] = []
    for (let round = 0; round < 30; round++) {
      for (const prefix of prefixes) {
        const t = performance.now()
        const r = ask(prefix)
        samples.push(performance.now() - t)
        expect(r.items.length).toBeGreaterThan(0)
      }
    }
    const s = stats(samples)
    expect(s.p50).toBeLessThan(2)
    expect(s.p95).toBeLessThan(12)
  })
})
