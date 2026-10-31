/**
 * Catálogo de ejemplo de Framezen: original, coherente y completo para que la app
 * funcione sin los datos reales de marcas. Las medidas son plausibles para PVC y los
 * precios (CLP, barra de 5,8 m) son de referencia, marcados como «de ejemplo».
 */
import type { BrandSettings, Catalog, Color, Glass, Line, Pauta, Profile, ProfileRole, TypologyId } from '@framezen/engine'
import { COLOR_PALETTE } from './colors'
import { GENERIC_BRAND, GENERIC_BRAND_ID, GENERIC_ITEMS, SAMPLE_SOURCE, genericRulesFor } from './rules'
import { slug } from './text'

const PROFILE_BRAND = 'ejemplo-pvc'
const GLASS_BRAND = 'ejemplo-vidrios'

const COLOR_IDS = ['blanco', 'nogal', 'roble-dorado', 'antracita', 'negro'] as const
/** Recargo por color sobre el blanco (foliados y masa negra). */
const COLOR_FACTOR: Record<(typeof COLOR_IDS)[number], number> = {
  blanco: 1,
  nogal: 1.45,
  'roble-dorado': 1.45,
  antracita: 1.55,
  negro: 1.72,
}

const colors: Color[] = COLOR_IDS.map((id) => COLOR_PALETTE.find((color) => color.id === id)!)

function prices(white: number, colorless = false): Record<string, number> {
  return Object.fromEntries(COLOR_IDS.map((id) => [id, colorless ? white : Math.round((white * COLOR_FACTOR[id]) / 10) * 10]))
}

interface ProfileSpec {
  code: string
  name: string
  role: ProfileRole
  white: number
  face?: number
  reinforcement?: string
  /** Acero o aluminio: mismo precio en todos los colores. */
  colorless?: boolean
}

function buildProfiles(lineId: string, specs: ProfileSpec[]): Profile[] {
  return specs.map((spec) => ({
    id: `${lineId}.${slug(spec.code)}`,
    lineId,
    code: spec.code,
    name: spec.name,
    role: spec.role,
    ...(spec.face ? { face: spec.face } : {}),
    barLength: 5800,
    priceByColor: prices(spec.white, spec.colorless || spec.role === 'reinforcement'),
    ...(spec.reinforcement ? { reinforcementId: `${lineId}.${slug(spec.reinforcement)}` } : {}),
    weightKgM: spec.role === 'reinforcement' ? 1.7 : spec.role === 'bead' ? 0.2 : 1.2,
  }))
}

function defaults(lineId: string, roles: Partial<Record<ProfileRole, string>>): Partial<Record<ProfileRole, string>> {
  return Object.fromEntries(Object.entries(roles).map(([role, code]) => [role, `${lineId}.${slug(code!)}`]))
}

// ── Serie 60 Practicable ─────────────────────────────────────────────────────
const S60 = 'serie-60'
const s60Pauta: Pauta = {
  weld: 3,
  frameDeduction: 45,
  sashWidth: 78,
  sashDeduction: 58,
  sashOverlap: 8,
  glassGap: 5,
  mullionDeduction: 20,
  reinforcement: { frame: 110, sash: 140, mullion: 20 },
}
const s60Profiles = buildProfiles(S60, [
  { code: 'S60-01', name: 'Marco 60', role: 'frame', white: 26900, face: 65, reinforcement: 'S60-R1' },
  { code: 'S60-02', name: 'Hoja de ventana 78', role: 'sash', white: 33400, face: 78, reinforcement: 'S60-R2' },
  { code: 'S60-03', name: 'Travesaño 80', role: 'mullion', white: 31200, face: 80, reinforcement: 'S60-R1' },
  { code: 'S60-04', name: 'Batiente de doble hoja', role: 'french_mullion', white: 29600, face: 62, reinforcement: 'S60-R2' },
  { code: 'S60-05', name: 'Junquillo termopanel 20 mm', role: 'bead', white: 6400, face: 20 },
  { code: 'S60-06', name: 'Junquillo monolítico 4–6 mm', role: 'bead', white: 7900, face: 34 },
  { code: 'S60-07', name: 'Perfil de unión entre ventanas', role: 'coupler', white: 9800, face: 22 },
  { code: 'S60-R1', name: 'Refuerzo de marco y travesaño 1,5 mm', role: 'reinforcement', white: 11200 },
  { code: 'S60-R2', name: 'Refuerzo de hoja 1,2 mm', role: 'reinforcement', white: 9600 },
])

// ── Serie 70 Corredera ───────────────────────────────────────────────────────
const S70 = 'serie-70-corredera'
const s70Pauta: Pauta = {
  weld: 3,
  frameDeduction: 50,
  sashWidth: 82,
  sashDeduction: 62,
  sashOverlap: 8,
  glassGap: 5,
  mullionDeduction: 20,
  reinforcement: { frame: 128, sash: 150 },
}
const s70Profiles = buildProfiles(S70, [
  { code: 'S70C-01', name: 'Marco corredera 2 rieles', role: 'sliding_frame', white: 31800, face: 50, reinforcement: 'S70C-R5' },
  { code: 'S70C-02', name: 'Marco corredera 3 rieles', role: 'sliding_frame', white: 52900, face: 50, reinforcement: 'S70C-R5' },
  { code: 'S70C-03', name: 'Marco monorriel', role: 'sliding_frame', white: 39500, face: 50, reinforcement: 'S70C-R5' },
  { code: 'S70C-04', name: 'Hoja corredera 82', role: 'sliding_sash', white: 35900, face: 82, reinforcement: 'S70C-R6' },
  { code: 'S70C-05', name: 'Traslapo central', role: 'interlock', white: 10900, face: 30 },
  { code: 'S70C-06', name: 'Junquillo corredera 20 mm', role: 'bead', white: 6600, face: 18 },
  { code: 'S70C-07', name: 'Riel de aluminio', role: 'guide', white: 5200, colorless: true },
  { code: 'S70C-R5', name: 'Refuerzo de marco corredera 1,5 mm', role: 'reinforcement', white: 12400 },
  { code: 'S70C-R6', name: 'Refuerzo de hoja corredera 1,2 mm', role: 'reinforcement', white: 10900 },
])

// ── Serie Puerta 70 ──────────────────────────────────────────────────────────
const P70 = 'serie-puerta-70'
const p70Pauta: Pauta = {
  weld: 3,
  frameDeduction: 46,
  sashWidth: 80,
  sashDeduction: 60,
  sashOverlap: 8,
  glassGap: 5,
  mullionDeduction: 22,
  reinforcement: { frame: 112, sash: 146, mullion: 20 },
}
const p70Profiles = buildProfiles(P70, [
  { code: 'P70-01', name: 'Marco 70', role: 'frame', white: 32400, face: 66, reinforcement: 'P70-R3' },
  { code: 'P70-02', name: 'Hoja de ventana 80', role: 'sash', white: 36900, face: 80, reinforcement: 'P70-R4' },
  { code: 'P70-03', name: 'Hoja de puerta 112', role: 'door_sash', white: 52900, face: 112, reinforcement: 'P70-R7' },
  { code: 'P70-04', name: 'Travesaño 84', role: 'mullion', white: 37800, face: 84, reinforcement: 'P70-R3' },
  { code: 'P70-05', name: 'Batiente de puerta doble', role: 'french_mullion', white: 33900, face: 64, reinforcement: 'P70-R3' },
  { code: 'P70-06', name: 'Umbral de aluminio', role: 'threshold', white: 18900, face: 20, colorless: true },
  { code: 'P70-07', name: 'Junquillo termopanel 20 mm', role: 'bead', white: 7200, face: 20 },
  { code: 'P70-R3', name: 'Refuerzo de marco 1,5 mm', role: 'reinforcement', white: 13900 },
  { code: 'P70-R4', name: 'Refuerzo de hoja 1,5 mm', role: 'reinforcement', white: 12600 },
  { code: 'P70-R7', name: 'Refuerzo de hoja de puerta 2 mm', role: 'reinforcement', white: 24800 },
])

const WINDOW_TYPOLOGIES: TypologyId[] = [
  'fixed',
  'casement',
  'casement_out',
  'tilt_turn',
  'tilt',
  'awning',
  'casement_double',
  'fixed_casement',
  'fixed_tilt_turn',
  'casement_transom',
  'fixed_awning_bottom',
  'fixed_3',
  'casement_fixed_casement',
  'arch',
  'trapezoid',
  'triangle',
]

const lines: Line[] = [
  {
    id: S60,
    brandId: PROFILE_BRAND,
    name: 'Serie 60 Practicable',
    kind: 'casement',
    material: 'pvc',
    description: 'Practicable 60 mm, 4 cámaras',
    depth: 60,
    chambers: 4,
    pauta: s60Pauta,
    profiles: defaults(S60, {
      frame: 'S60-01',
      sash: 'S60-02',
      mullion: 'S60-03',
      french_mullion: 'S60-04',
      bead: 'S60-05',
      coupler: 'S60-07',
      reinforcement: 'S60-R1',
    }),
    colorIds: [...COLOR_IDS],
    typologyIds: WINDOW_TYPOLOGIES,
    ...genericRulesFor('casement'),
    source: SAMPLE_SOURCE,
    completeness: 'complete',
  },
  {
    id: S70,
    brandId: PROFILE_BRAND,
    name: 'Serie 70 Corredera',
    kind: 'sliding',
    material: 'pvc',
    description: 'Corredera 70 mm, 3 cámaras',
    depth: 70,
    chambers: 3,
    pauta: s70Pauta,
    profiles: defaults(S70, {
      sliding_frame: 'S70C-01',
      sliding_sash: 'S70C-04',
      interlock: 'S70C-05',
      bead: 'S70C-06',
      guide: 'S70C-07',
      reinforcement: 'S70C-R5',
    }),
    colorIds: [...COLOR_IDS],
    typologyIds: ['sliding_2', 'sliding_2_fixed', 'sliding_3', 'sliding_3_rail', 'sliding_4', 'sliding_mono'],
    ...genericRulesFor('sliding'),
    source: SAMPLE_SOURCE,
    completeness: 'complete',
  },
  {
    id: P70,
    brandId: PROFILE_BRAND,
    name: 'Serie Puerta 70',
    kind: 'casement',
    material: 'pvc',
    description: 'Puertas y ventanas 70 mm, 5 cámaras',
    depth: 70,
    chambers: 5,
    pauta: p70Pauta,
    doorPauta: { sashWidth: 112, sashDeduction: 92 },
    profiles: defaults(P70, {
      frame: 'P70-01',
      sash: 'P70-02',
      door_sash: 'P70-03',
      mullion: 'P70-04',
      french_mullion: 'P70-05',
      threshold: 'P70-06',
      bead: 'P70-07',
      reinforcement: 'P70-R3',
    }),
    colorIds: [...COLOR_IDS],
    typologyIds: ['door', 'door_double', 'door_sidelight', 'door_transom', 'fixed', 'casement', 'tilt_turn', 'casement_double'],
    ...genericRulesFor('casement'),
    source: SAMPLE_SOURCE,
    completeness: 'complete',
  },
]

const glass: Glass[] = [
  { id: 'incoloro-4', brandId: GLASS_BRAND, name: 'Incoloro 4 mm', kind: 'mono', thickness: 4, composition: '4 incoloro', pricePerM2: 14900, minArea: 0.25, weightKgM2: 10 },
  { id: 'incoloro-5', brandId: GLASS_BRAND, name: 'Incoloro 5 mm', kind: 'mono', thickness: 5, composition: '5 incoloro', pricePerM2: 16900, minArea: 0.25, weightKgM2: 12.5 },
  { id: 'laminado-3-3', brandId: GLASS_BRAND, name: 'Laminado 3+3', kind: 'laminated', thickness: 6.4, composition: '3 incoloro + PVB 0,38 + 3 incoloro', pricePerM2: 34900, minArea: 0.25, weightKgM2: 15.2 },
  { id: 'dvh-4-12-4', brandId: GLASS_BRAND, name: 'DVH 4+12+4', kind: 'dvh', thickness: 20, composition: '4 incoloro + 12 cámara + 4 incoloro', pricePerM2: 32900, minArea: 0.3, weightKgM2: 20 },
  { id: 'dvh-5-12-5', brandId: GLASS_BRAND, name: 'DVH 5+12+5', kind: 'dvh', thickness: 22, composition: '5 incoloro + 12 cámara + 5 incoloro', pricePerM2: 38900, minArea: 0.3, weightKgM2: 25 },
  { id: 'dvh-4-12-4-low-e', brandId: GLASS_BRAND, name: 'DVH 4+12+4 low-e', kind: 'dvh', thickness: 20, composition: '4 low-e + 12 cámara + 4 incoloro', pricePerM2: 46900, minArea: 0.3, weightKgM2: 20 },
]

const brandSettings: BrandSettings[] = [PROFILE_BRAND, GENERIC_BRAND_ID, GLASS_BRAND].map((brandId) => ({
  brandId,
  enabled: true,
  trim: 0,
  kerf: 4,
  discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 },
}))

export const SAMPLE_CATALOG: Catalog = {
  colors,
  brands: [
    { id: PROFILE_BRAND, name: 'Perfiles de ejemplo', kind: 'profiles', country: 'Chile', monogram: 'PE', accent: '#2747C2' },
    GENERIC_BRAND,
    { id: GLASS_BRAND, name: 'Vidrios de ejemplo', kind: 'glass', country: 'Chile', monogram: 'VE', accent: '#5C8A93' },
  ],
  lines,
  profiles: [...s60Profiles, ...s70Profiles, ...p70Profiles],
  items: GENERIC_ITEMS,
  glass,
  brandSettings,
}

/** Valores por defecto recomendados al usar el catálogo de ejemplo. */
export const SAMPLE_DEFAULTS = { lineId: S60, colorId: 'blanco', glassId: 'dvh-4-12-4' } as const
