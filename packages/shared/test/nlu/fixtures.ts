/**
 * Datos de prueba del intérprete: catálogo, entidades, contexto de una cotización abierta y
 * estadísticas con bordes de zona horaria (America/Santiago).
 */
import { createGlossaryHelpers, glossary } from '../../src/i18n/glossary'
import type { Locale } from '../../src/i18n/locales'
import { createNlu, type NluCatalog, type NluContext, type NluEntities, type NluStatsData } from '../../src/nlu'

export const GLOSSARY = createGlossaryHelpers(glossary)

export const CATALOG: NluCatalog = {
  version: 'cat-1',
  lines: [
    { id: 'ln-softline', name: 'SOFTLINE 70', brand: 'VEKA', kind: 'casement' },
    { id: 'ln-euro', name: 'Euro 60', kind: 'casement' },
    { id: 'ln-slide', name: 'Slide 80', kind: 'sliding' },
  ],
  colors: [
    { id: 'col-white', name: 'Blanco', textureId: 'white_9016' },
    { id: 'col-anthracite', name: 'Gris antracita', code: 'RAL 7016', textureId: 'anthracite_7016_smooth' },
    { id: 'col-walnut', name: 'Nogal', textureId: 'nut_tree' },
    { id: 'col-golden', name: 'Roble dorado', textureId: 'golden_oak' },
  ],
  glass: [
    { id: 'gl-dvh', name: 'Termopanel 4+12+4', kind: 'dvh', composition: '4/12/4' },
    { id: 'gl-dvh-lowe', name: 'DVH 4/16/4 Low-E', kind: 'dvh', composition: '4/16/4' },
    { id: 'gl-lam', name: 'Laminado 3+3', kind: 'laminated' },
    { id: 'gl-mono', name: 'Simple 4 mm', kind: 'mono' },
  ],
}

export const ENTITIES: NluEntities = {
  version: 'ent-1',
  clients: [
    { id: 'cl-maria', name: 'María Soto', email: 'maria.soto@example.com' },
    { id: 'cl-mario', name: 'Mario Pérez', phone: '+56 9 1111 1111' },
    { id: 'cl-andes', name: 'Constructora Andes' },
    { id: 'cl-ana', name: 'Ana Ruiz' },
  ],
  quotes: [
    { id: 'q123', number: 123, title: 'Casa Sur', clientName: 'María Soto', status: 'draft' },
    { id: 'q124', number: 124, title: 'Edificio Norte', clientName: 'Constructora Andes', status: 'sent' },
    { id: 'q-open', number: 130, title: 'Obra actual', status: 'draft' },
  ],
  templates: [
    { id: 'tpl-moderna', name: 'Moderna', kind: 'quote' },
    { id: 'tpl-luz', name: 'Luz', kind: 'quote', preset: true },
    { id: 'tpl-plano', name: 'Plano', kind: 'quote', preset: true },
  ],
  assistants: [
    { id: 'as-marco', name: 'Marco' },
    { id: 'as-sofia', name: 'Sofía' },
  ],
}

/** 2026-10-31 23:30 en Santiago (UTC−3): «este mes» es octubre aunque en UTC ya sea 1 de noviembre. */
export const NOW = '2026-11-01T02:30:00Z'

export const STATS: NluStatsData = {
  complete: true,
  quotes: [
    { id: 's1', number: 201, clientName: 'María Soto', status: 'accepted', total: 1_200_000, createdAt: '2026-10-02T13:00:00Z', sentAt: '2026-10-03T13:00:00Z', acceptedAt: '2026-10-05T14:00:00Z', items: [{ typology: 'sliding_2', qty: 3 }] },
    { id: 's2', number: 202, clientName: 'Mario Pérez', status: 'workshop', total: 800_000, createdAt: '2026-10-10T13:00:00Z', sentAt: '2026-10-11T13:00:00Z', acceptedAt: '2026-10-20T15:00:00Z', items: [{ typology: 'tilt_turn', qty: 2 }, { typology: 'sliding_2', qty: 1 }] },
    { id: 's3', number: 203, clientName: 'Constructora Andes', status: 'sent', total: 500_000, createdAt: '2026-10-24T13:00:00Z', sentAt: '2026-10-25T13:00:00Z', items: [{ typology: 'fixed', qty: 2 }] },
    { id: 's4', number: 204, clientName: 'Ana Ruiz', status: 'rejected', total: 650_000, createdAt: '2026-10-08T13:00:00Z', sentAt: '2026-10-10T13:00:00Z', items: [{ typology: 'casement', qty: 1 }] },
    { id: 's5', number: 205, clientName: 'María Soto', status: 'accepted', total: 2_000_000, createdAt: '2026-09-20T13:00:00Z', sentAt: '2026-09-21T13:00:00Z', acceptedAt: '2026-09-28T13:00:00Z', items: [{ typology: 'sliding_4', qty: 1 }] },
    { id: 's6', number: 206, clientName: 'Mario Pérez', status: 'draft', total: 420_000, createdAt: '2026-10-30T13:00:00Z', items: [{ typology: 'tilt_turn', qty: 4 }] },
    // 31 de octubre 23:00 en Santiago (ya 1 de noviembre en UTC): cuenta en octubre.
    { id: 's7', number: 207, clientName: 'Ana Ruiz', status: 'accepted', total: 300_000, createdAt: '2026-10-29T13:00:00Z', sentAt: '2026-10-30T13:00:00Z', acceptedAt: '2026-11-01T02:00:00Z', items: [{ typology: 'sliding_2', qty: 2 }] },
    // 30 de septiembre 23:00 en Santiago (1 de octubre en UTC): cuenta en septiembre.
    { id: 's8', number: 208, clientName: 'Constructora Andes', status: 'accepted', total: 999_999, createdAt: '2026-09-25T13:00:00Z', sentAt: '2026-09-26T13:00:00Z', acceptedAt: '2026-10-01T02:00:00Z', items: [{ typology: 'fixed', qty: 1 }] },
  ],
}

/** Ventas de octubre en Santiago: 1.200.000 + 800.000 + 300.000. */
export const OCTOBER_SALES = 2_300_000

export const QUOTE_CTX: NluContext = {
  route: '/cotizaciones/q-open',
  quoteOpen: true,
  quoteId: 'q-open',
  items: [
    { id: 'i1', ref: 'V1', typology: 'sliding_2', qty: 1, location: 'Living' },
    { id: 'i2', ref: 'V2', typology: 'tilt_turn', qty: 2, location: 'Cocina' },
    { id: 'i3', ref: 'V3', typology: 'fixed', qty: 1 },
    { id: 'i4', ref: 'V4', typology: 'casement', qty: 1 },
  ],
  stats: STATS,
  assistantNames: ['Marco', 'Sofía'],
  now: NOW,
}

export const HOME_CTX: NluContext = { route: '/', quoteOpen: false, stats: STATS, assistantNames: ['Marco', 'Sofía'], now: NOW }

export function makeNlu(locale: Locale = 'es', extra: { withData?: boolean } = {}) {
  const withData = extra.withData !== false
  return createNlu({
    locale,
    glossary: GLOSSARY,
    catalog: withData ? CATALOG : undefined,
    entities: withData ? ENTITIES : undefined,
    currency: 'CLP',
    timeZone: 'America/Santiago',
  })
}
