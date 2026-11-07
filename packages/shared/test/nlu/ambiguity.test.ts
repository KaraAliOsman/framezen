/**
 * Ambigüedad: homónimos, coincidencias parciales, errores de tipeo y valores del catálogo con varias
 * lecturas nunca se asignan en silencio: el plan queda en espera con opciones.
 */
import { describe, expect, it } from 'vitest'
import { createNlu, type NluCatalog, type NluEntities } from '../../src/nlu'
import { CATALOG, ENTITIES, GLOSSARY, makeNlu, QUOTE_CTX } from './fixtures'

const twins: NluEntities = {
  ...ENTITIES,
  version: 'twins',
  clients: [...ENTITIES.clients!, { id: 'cl-ana-2', name: 'Ana Ruiz', email: 'ana.ruiz@otra.cl' }, { id: 'cl-perez-2', name: 'Rosa Pérez' }],
}
const woods: NluCatalog = {
  ...CATALOG,
  version: 'woods',
  colors: [...CATALOG.colors!, { id: 'col-oak-grey', name: 'Roble gris' }, { id: 'col-walnut-dark', name: 'Nogal oscuro' }],
}
const nlu = createNlu({ locale: 'es', glossary: GLOSSARY, catalog: woods, entities: twins })

describe('ambigüedad', () => {
  it('dos clientes con el mismo nombre: elige la persona (con su detalle)', () => {
    const r = nlu.parse('asigna el cliente "Ana Ruiz"', QUOTE_CTX)
    expect(r.status).toBe('ambiguous')
    expect(r.plan).toBeNull()
    const choices = r.missing.find((m) => m.kind === 'client')!.choices!
    expect(choices.map((c) => c.id).sort()).toEqual(['cl-ana', 'cl-ana-2'])
    expect(choices.some((c) => c.detail === 'ana.ruiz@otra.cl')).toBe(true)
  })

  it('un apellido compartido no se asigna solo', () => {
    const r = nlu.parse('asigna el cliente Pérez', QUOTE_CTX)
    expect(r.status).toBe('ambiguous')
    expect(r.missing[0].choices!.map((c) => c.id).sort()).toEqual(['cl-mario', 'cl-perez-2'])
  })

  it('un nombre con error de tipeo propone, no asigna', () => {
    const r = makeNlu('es').parse('asigna el cliente Ruis', QUOTE_CTX)
    expect(r.status).toBe('ambiguous')
    expect(r.missing[0].choices!.map((c) => c.id)).toEqual(['cl-ana'])
  })

  it('el nombre exacto del catálogo gana; un nombre genérico con varias variantes pregunta', () => {
    expect(nlu.parse('ponle nogal a la V2', QUOTE_CTX).plan![0].args).toMatchObject({ colorId: 'col-walnut' })
    expect(nlu.parse('ponle nogal oscuro a la V2', QUOTE_CTX).plan![0].args).toMatchObject({ colorId: 'col-walnut-dark' })
    const oak = nlu.parse('ponle roble a la V2', QUOTE_CTX)
    expect(oak.status).toBe('ambiguous')
    expect(oak.missing[0].choices!.map((c) => c.id).sort()).toEqual(['col-golden', 'col-oak-grey'])
  })

  it('correcciones de tipeo: palabra larga → supuesto visible; palabra corta → confirmar', () => {
    const long = makeNlu('es').parse('agrega una oscilobatientte de 800x1200', QUOTE_CTX)
    expect(long.status).toBe('ready')
    expect(long.plan![0].args).toMatchObject({ typology: 'tilt_turn' })
    expect(long.assumptions.join(' ')).toMatch(/oscilobatientte/)
    const short = makeNlu('es').parse('agrega un fiko de 800x1200', QUOTE_CTX)
    expect(short.status).toBe('ambiguous')
    expect(short.repairs[0].text).toBe('agrega un fijo de 800x1200')
  })

  it('los verbos que mandan o borran nunca se corrigen por tipeo', () => {
    expect(makeNlu('es').parse('enviaa la cotización por correo', QUOTE_CTX).status).toBe('unmatched')
    expect(makeNlu('es').parse('borrra la V2', QUOTE_CTX).status).toBe('unmatched')
  })

  it('«1.500» es ambiguo entre idiomas: con unidad en metros se lee como decimal', () => {
    expect(makeNlu('es').parse('agrega una corredera de 1.500 x 1.200 m', QUOTE_CTX).plan![0].args).toMatchObject({ width: 1500, height: 1200 })
    expect(makeNlu('es').parse('agrega una corredera de 1.500 x 1.200', QUOTE_CTX).plan![0].args).toMatchObject({ width: 1500, height: 1200 })
  })
})
