/**
 * Diseños predefinidos como DATOS: 5 de cotización y 4 de catálogo. Cada uno es una composición propia
 * (retícula, tipografía, estructura de secciones y ficha de ventana), no un cambio de color. Los
 * nombres canónicos van en español; los traducidos están en `i18n` (`presetName`).
 *
 * En toda cotización el total cierra las ventanas: secciones de contenido, luego `totals`, opcionales,
 * forma de pago, garantía, condiciones y `acceptance` (`AFTER_TOTALS_SECTIONS`). La carta viene apagada.
 */
import { createSection, type CreateSectionInput, type DocSection, type DocSectionType } from './sections'
import { cloneJson } from './safety'
import { fontPairById, type DocFontPairId } from './fonts'
import type { DocPalette, DocTheme } from './theme'
import type { DocPage } from './page'
import type { DocTemplate } from './template'
import type { DocTemplateKind } from './kinds'
import {
  DOC_PRESET_IDS,
  LEGACY_TEMPLATE_PRESETS,
  isDocPresetId,
  isLegacyTemplateId,
  presetKind,
  type DocPresetId,
} from './preset-ids'

type ThemeInput = Omit<DocTheme, 'fonts'> & { fontPair: DocFontPairId }

function theme(input: ThemeInput): DocTheme {
  const { fontPair, ...rest } = input
  const pair = fontPairById(fontPair)!
  return { ...rest, fonts: { heading: pair.heading, body: pair.body, mono: pair.mono } }
}

function page(input: Partial<DocPage> & { margin?: number }): DocPage {
  const m = input.margin ?? 16
  return {
    size: input.size ?? 'Letter',
    ...(input.orientation ? { orientation: input.orientation } : {}),
    margins: input.margins ?? { top: m, right: m, bottom: m, left: m },
    header: input.header ?? 'logo_reference',
    footer: input.footer ?? 'reference',
    pageNumbers: input.pageNumbers ?? 'page_of_total',
    pageNumberAlign: input.pageNumberAlign ?? 'right',
    chromeOnCover: input.chromeOnCover ?? false,
  }
}

type SectionSpec = { [T in DocSectionType]: CreateSectionInput<T> }[DocSectionType]

function sections(specs: SectionSpec[]): DocSection[] {
  const taken: string[] = []
  return specs.map((spec) => {
    const section = createSection(spec as CreateSectionInput, taken)
    taken.push(section.id)
    return section as DocSection
  })
}

interface PresetInput {
  id: DocPresetId
  name: string
  description: string
  theme: ThemeInput
  page: Partial<DocPage> & { margin?: number }
  sections: SectionSpec[]
}

function preset(input: PresetInput): DocTemplate {
  return {
    schemaVersion: 1,
    id: input.id,
    kind: presetKind(input.id),
    name: input.name,
    description: input.description,
    presetId: input.id,
    theme: theme(input.theme),
    page: page(input.page),
    ...(presetKind(input.id) === 'quote' ? { settings: {} } : {}),
    sections: sections(input.sections),
  }
}

const palette = (p: DocPalette) => p

const PRESET_INPUTS: PresetInput[] = [
  // Propuesta de estudio de arquitectura: portada tipográfica, títulos al margen y una lámina por ventana.
  {
    id: 'atelier',
    name: 'Atelier',
    description: 'Propuesta de estudio de arquitectura: portada limpia, títulos al margen y una lámina con cada ventana a gran escala.',
    theme: {
      palette: palette({ paper: '#FFFFFF', surface: '#F4F4F2', ink: '#141414', muted: '#5E5E5B', rule: '#D9D9D5', accent: '#141414', onAccent: '#FFFFFF', strong: '#141414', onStrong: '#FFFFFF' }),
      fontPair: 'hanken',
      headingWeight: 500,
      labelCase: 'normal',
      density: 'airy',
      typeScale: 'editorial',
      radius: 'none',
      rules: 'hairline',
      accentUsage: 'minimal',
      drawingStyle: 'realistic',
      imageTreatment: 'natural',
      composition: 'atelier',
    },
    page: { margins: { top: 14, right: 14, bottom: 12, left: 14 }, header: 'none', footer: 'reference', pageNumbers: 'page', pageNumberAlign: 'right' },
    sections: [
      { type: 'cover', options: { variant: 'typographic', showLogo: true, showFacts: true, showClient: true } },
      { type: 'client_strip', pageBreak: 'before', options: { variant: 'grid', fields: ['client', 'site', 'validity', 'adviser', 'contact', 'custom', 'scope'] } },
      { type: 'letter', enabled: false, options: { variant: 'letter', showSignature: true, showDate: true } },
      { type: 'project_summary', options: { variant: 'index', showUnits: true, showArea: true, showLeadTime: false, showValidity: false, showGroups: false } },
      { type: 'items', pageBreak: 'before', options: { variant: 'per_page', columns: 1, drawingSize: 'xl', drawingDimensions: 'total', drawingView: 'interior', finishes: 'inside_outside', showSwatches: true, showArea: true, showUnitPrices: false, showLineTotals: true } },
      { type: 'totals', pageBreak: 'before', options: { variant: 'band' } },
      { type: 'options_comparison', options: { variant: 'table' } },
      { type: 'payment', options: { variant: 'table', showSchedule: true } },
      { type: 'warranty', options: { variant: 'plain' } },
      { type: 'terms', options: { variant: 'numbered', columns: 1 } },
      { type: 'acceptance', options: { variant: 'full', showQr: true } },
    ],
  },
  // Corporativa sobria para constructoras: capítulos numerados, cuadro de partidas y dos firmas.
  {
    id: 'corporativa',
    name: 'Corporativa',
    description: 'Sobria y ordenada para constructoras e inmobiliarias: capítulos numerados, cuadro de partidas por piso y firma de ambas partes.',
    theme: {
      palette: palette({ paper: '#FFFFFF', surface: '#EEF1F5', ink: '#16202C', muted: '#526070', rule: '#CDD4DC', accent: '#14365F', onAccent: '#FFFFFF', strong: '#14365F', onStrong: '#FFFFFF' }),
      fontPair: 'public-source-serif',
      headingWeight: 600,
      labelCase: 'normal',
      density: 'comfortable',
      typeScale: 'standard',
      radius: 'none',
      rules: 'hairline',
      accentUsage: 'headings',
      drawingStyle: 'realistic',
      imageTreatment: 'natural',
      composition: 'corporativa',
    },
    page: { margins: { top: 16, right: 18, bottom: 14, left: 18 }, header: 'logo_reference', footer: 'contact', pageNumbers: 'page_of_total', pageNumberAlign: 'right' },
    sections: [
      { type: 'cover', tone: 'strong', options: { variant: 'typographic', showLogo: true, showFacts: true, showClient: true } },
      { type: 'client_strip', title: 'Antecedentes', options: { variant: 'grid', fields: ['client', 'project', 'site', 'reference', 'date', 'validity', 'adviser', 'contact', 'custom', 'scope'] } },
      { type: 'letter', enabled: false, options: { variant: 'short_note', showSignature: false, showDate: false } },
      { type: 'project_summary', options: { variant: 'facts', showUnits: true, showArea: true, showLeadTime: false, showValidity: false, showGroups: false } },
      { type: 'items', options: { variant: 'table', columns: 1, drawingSize: 's', drawingDimensions: 'none', finishes: 'combined', showSwatches: false, showArea: false, groupBy: 'floor', showGroupSubtotals: true } },
      { type: 'totals', pageBreak: 'before', options: { variant: 'stack', showArea: true } },
      { type: 'options_comparison', options: { variant: 'table' } },
      { type: 'payment', options: { variant: 'table', showSchedule: true } },
      { type: 'warranty', options: { variant: 'matrix' } },
      { type: 'terms', options: { variant: 'numbered', columns: 1 } },
      { type: 'acceptance', options: { variant: 'full', showQr: true, showCompanySignature: true } },
    ],
  },
  // Planilla para obra y alto volumen: sin portada, la primera ventana ya está en la primera hoja.
  {
    id: 'obra',
    name: 'Obra',
    description: 'Planilla compacta para obra y alto volumen: sin portada, muchas partidas por hoja y encabezado que se repite.',
    theme: {
      palette: palette({ paper: '#FFFFFF', surface: '#F1F1EF', ink: '#111111', muted: '#55554F', rule: '#CFCFC9', accent: '#D4420A', onAccent: '#FFFFFF', strong: '#111111', onStrong: '#FFFFFF' }),
      fontPair: 'archivo',
      headingWeight: 700,
      labelCase: 'normal',
      density: 'compact',
      typeScale: 'compact',
      radius: 'none',
      rules: 'strong',
      accentUsage: 'minimal',
      drawingStyle: 'technical',
      imageTreatment: 'natural',
      composition: 'obra',
    },
    page: { margins: { top: 10, right: 11, bottom: 9, left: 11 }, header: 'reference', footer: 'reference', chromeOnCover: true },
    sections: [
      { type: 'client_strip', options: { variant: 'strip', fields: ['client', 'project', 'site', 'contact', 'adviser', 'custom', 'scope'] } },
      { type: 'items', options: { variant: 'table', columns: 1, drawingSize: 'xs', drawingDimensions: 'none', drawingStyle: 'technical', finishes: 'combined', showSwatches: false, showArea: false } },
      { type: 'totals', options: { variant: 'stack', showArea: true } },
      { type: 'options_comparison', options: { variant: 'table' } },
      { type: 'payment', options: { variant: 'text', showSchedule: true } },
      { type: 'warranty', options: { variant: 'plain' } },
      { type: 'terms', options: { variant: 'compact', columns: 2 } },
      { type: 'acceptance', options: { variant: 'inline', showQr: true, showSignatureLines: true } },
    ],
  },
  // Vivienda particular: carta primero, recinto por recinto y un cierre que explica lo que incluye.
  {
    id: 'hogar',
    name: 'Hogar',
    description: 'Para familias: letra grande, las ventanas recinto por recinto y un cierre que explica qué incluye el precio.',
    theme: {
      palette: palette({ paper: '#FFFFFF', surface: '#F5F3EF', ink: '#23211E', muted: '#5F5B55', rule: '#DDD9D2', accent: '#23211E', onAccent: '#FFFFFF', strong: '#23211E', onStrong: '#FFFFFF' }),
      fontPair: 'literata-source-sans',
      headingWeight: 500,
      labelCase: 'normal',
      density: 'comfortable',
      typeScale: 'standard',
      radius: 'none',
      rules: 'none',
      accentUsage: 'headings',
      drawingStyle: 'realistic',
      imageTreatment: 'natural',
      composition: 'hogar',
    },
    page: { margins: { top: 18, right: 20, bottom: 14, left: 20 }, header: 'logo', footer: 'contact', pageNumbers: 'page', pageNumberAlign: 'right' },
    sections: [
      { type: 'client_strip', options: { variant: 'strip', fields: ['client', 'site', 'contact', 'adviser', 'custom', 'scope'] } },
      { type: 'letter', enabled: false, options: { variant: 'letter', showSignature: true, showDate: true } },
      { type: 'project_summary', enabled: false, options: { variant: 'scope', showUnits: false, showArea: false, showLeadTime: true, showValidity: false, showGroups: false } },
      { type: 'items', options: { variant: 'cards', columns: 2, drawingSize: 'm', drawingDimensions: 'total', drawingView: 'interior', groupBy: 'room', showGroupSubtotals: false, finishes: 'inside_outside', showSwatches: true } },
      { type: 'totals', pageBreak: 'before', options: { variant: 'decision' } },
      { type: 'options_comparison', options: { variant: 'table' } },
      { type: 'payment', options: { variant: 'timeline', showSchedule: true } },
      { type: 'warranty', options: { variant: 'plain' } },
      { type: 'terms', options: { variant: 'columns', columns: 2 } },
      { type: 'acceptance', options: { variant: 'full', showQr: true } },
    ],
  },
  // Memoria técnica horizontal: hoja de control y una ficha por abertura para arquitectos y licitaciones.
  {
    id: 'memoria',
    name: 'Memoria',
    description: 'Memoria técnica horizontal para arquitectos y licitaciones: cuadro de vanos, una ficha por abertura con todas sus cotas y especificación.',
    theme: {
      palette: palette({ paper: '#FFFFFF', surface: '#F2F3F4', ink: '#17191C', muted: '#555B62', rule: '#C9CDD2', accent: '#B3131B', onAccent: '#FFFFFF', strong: '#17191C', onStrong: '#FFFFFF' }),
      fontPair: 'overpass',
      headingWeight: 600,
      labelCase: 'normal',
      density: 'compact',
      typeScale: 'compact',
      radius: 'none',
      rules: 'strong',
      accentUsage: 'minimal',
      drawingStyle: 'technical',
      imageTreatment: 'monochrome',
      composition: 'memoria',
    },
    page: { orientation: 'landscape', margins: { top: 11, right: 13, bottom: 9, left: 13 }, header: 'reference', footer: 'contact', chromeOnCover: true },
    sections: [
      { type: 'client_strip', options: { variant: 'grid', fields: ['client', 'project', 'site', 'contact', 'adviser', 'custom', 'scope'] } },
      { type: 'project_summary', options: { variant: 'index', showUnits: true, showArea: true, showLeadTime: false, showValidity: false, showGroups: false } },
      { type: 'items', pageBreak: 'before', options: { variant: 'sheet', columns: 1, drawingSize: 'xl', drawingDimensions: 'all', drawingView: 'both', drawingStyle: 'technical', finishes: 'inside_outside', showSwatches: false, showArea: true, showPerformance: true, showUnitPrices: true, showLineTotals: true } },
      { type: 'technical_specs', pageBreak: 'before', options: { variant: 'schedule', showThermal: true, showAcoustic: true, showSecurity: true, showGlassBuildup: true, showHardware: true, showSources: true } },
      { type: 'totals', pageBreak: 'before', options: { variant: 'stack', showArea: true } },
      { type: 'options_comparison', options: { variant: 'table' } },
      { type: 'payment', options: { variant: 'table', showSchedule: true } },
      { type: 'warranty', options: { variant: 'plain' } },
      { type: 'terms', options: { variant: 'numbered', columns: 2 } },
      { type: 'acceptance', options: { variant: 'full', showQr: true, showCompanySignature: true } },
    ],
  },
  // C01 — lookbook residencial.
  {
    id: 'habitar',
    name: 'Habitar',
    description: 'Catálogo residencial: fotos amplias, guía para elegir y familias con su ficha técnica.',
    theme: {
      palette: palette({ paper: '#FFFFFF', surface: '#F4F3F0', ink: '#23211E', muted: '#5F5B55', rule: '#DDD9D2', accent: '#23211E', onAccent: '#FFFFFF', strong: '#23211E', onStrong: '#FFFFFF' }),
      fontPair: 'literata-source-sans',
      headingWeight: 500,
      labelCase: 'normal',
      density: 'airy',
      typeScale: 'editorial',
      radius: 'none',
      rules: 'none',
      accentUsage: 'headings',
      drawingStyle: 'realistic',
      imageTreatment: 'bleed',
    },
    page: { margin: 18, header: 'none', footer: 'contact', pageNumbers: 'page', pageNumberAlign: 'center' },
    sections: [
      { type: 'cover', options: { variant: 'photo', showLogo: true, showFacts: true, showClient: false } },
      { type: 'intro', pageBreak: 'before', options: { variant: 'contents', showContents: true } },
      { type: 'families', pageBreak: 'before', options: { variant: 'lifestyle', showOpeningDiagrams: true, showPerformance: false, showFromPrice: false, newPagePerFamily: true } },
      { type: 'product_cards', options: { variant: 'lookbook', columns: 1, drawingSize: 'xl', showColorVariants: true, showFromPrice: false, showSizeRange: true, showOpening: true, showQr: false } },
      { type: 'finishes', pageBreak: 'before', options: { variant: 'boards', showCodes: true, showTextures: true, swatchSize: 'l' } },
      { type: 'hardware', options: { variant: 'grid', showFinishes: true, showCodes: false } },
      { type: 'about_us', options: { variant: 'short', showContact: false } },
      { type: 'contact', options: { variant: 'card', showQr: true, showAddress: true, showWebsite: true } },
    ],
  },
  // C02 — manual de especificación.
  {
    id: 'sistema',
    name: 'Sistema',
    description: 'Manual de especificación para arquitectos: matriz de selección, una hoja técnica por familia y anexos de vidrio y herrajes.',
    theme: {
      palette: palette({ paper: '#FFFFFF', surface: '#EEF1F4', ink: '#14181C', muted: '#4A5259', rule: '#C9CFD5', accent: '#1F4F82', onAccent: '#FFFFFF', strong: '#14181C', onStrong: '#FFFFFF' }),
      fontPair: 'overpass',
      headingWeight: 600,
      labelCase: 'normal',
      density: 'compact',
      typeScale: 'compact',
      radius: 'none',
      rules: 'strong',
      accentUsage: 'bands',
      drawingStyle: 'technical',
      imageTreatment: 'monochrome',
    },
    page: { margin: 12, header: 'reference', footer: 'reference' },
    sections: [
      { type: 'cover', options: { variant: 'typographic', showLogo: true, showFacts: true, showClient: false } },
      { type: 'matrix', pageBreak: 'before', options: { variant: 'selection', rows: ['openings', 'depth', 'glazing', 'performance', 'max_size', 'finishes', 'price_from'] } },
      { type: 'families', pageBreak: 'before', options: { variant: 'sheet', showOpeningDiagrams: true, showPerformance: true, showFromPrice: false, newPagePerFamily: true } },
      { type: 'product_cards', options: { variant: 'rows', columns: 1, drawingSize: 'm', drawingStyle: 'technical', showFromPrice: false, showSizeRange: true, showOpening: true, showQr: false, showColorVariants: false } },
      { type: 'glass', pageBreak: 'before', options: { variant: 'layers', showPerformance: true, showBuildup: true, maxItems: 8 } },
      { type: 'hardware', options: { variant: 'list', showFinishes: true, showCodes: true } },
      { type: 'finishes', options: { variant: 'swatches', showCodes: true, showTextures: false, swatchSize: 's' } },
      { type: 'contact', options: { variant: 'band', showQr: true, showAddress: true, showWebsite: true } },
    ],
  },
  // C03 — atlas para distribuidores.
  {
    id: 'coleccion-modular',
    name: 'Colección Modular',
    description: 'Atlas para distribuidores: mapa de familias, tarjetas a dos columnas con código y QR, y comparación por capítulo.',
    theme: {
      palette: palette({ paper: '#FFFFFF', surface: '#F2F4F6', ink: '#1B1F24', muted: '#50575F', rule: '#D6DBE0', accent: '#14365F', onAccent: '#FFFFFF', strong: '#14365F', onStrong: '#FFFFFF' }),
      fontPair: 'public',
      headingWeight: 700,
      labelCase: 'normal',
      density: 'comfortable',
      typeScale: 'standard',
      radius: 'medium',
      rules: 'hairline',
      accentUsage: 'bands',
      drawingStyle: 'realistic',
      imageTreatment: 'rounded',
    },
    page: { margin: 14, header: 'logo', footer: 'contact_reference' },
    sections: [
      { type: 'cover', options: { variant: 'elevation', showLogo: true, showFacts: true, showClient: false } },
      { type: 'families', pageBreak: 'before', options: { variant: 'map', showOpeningDiagrams: true, showPerformance: false, showFromPrice: true, newPagePerFamily: false } },
      { type: 'product_cards', pageBreak: 'before', options: { variant: 'grid', columns: 2, drawingSize: 'm', showFromPrice: true, showSizeRange: true, showOpening: true, showQr: true, showColorVariants: false } },
      { type: 'matrix', options: { variant: 'comparison', rows: ['openings', 'max_size', 'finishes', 'price_from'] } },
      { type: 'finishes', pageBreak: 'before', options: { variant: 'swatches', showCodes: true, showTextures: true, swatchSize: 's' } },
      { type: 'hardware', options: { variant: 'grid', showFinishes: true, showCodes: true } },
      { type: 'contact', options: { variant: 'qr', showQr: true, showAddress: true, showWebsite: true } },
    ],
  },
  // C04 — colección de terminaciones.
  {
    id: 'materia-y-color',
    name: 'Materia y Color',
    description: 'Colección de terminaciones para asesorías de diseño: tableros interior/exterior, productos en variantes de color y guía para elegir.',
    theme: {
      palette: palette({ paper: '#FFFFFF', surface: '#F3F2EF', ink: '#20201E', muted: '#5C5B57', rule: '#DBDAD5', accent: '#20201E', onAccent: '#FFFFFF', strong: '#20201E', onStrong: '#FFFFFF' }),
      fontPair: 'source-serif-hanken',
      headingWeight: 500,
      labelCase: 'normal',
      density: 'airy',
      typeScale: 'editorial',
      radius: 'small',
      rules: 'hairline',
      accentUsage: 'minimal',
      drawingStyle: 'realistic',
      imageTreatment: 'framed',
    },
    page: { margin: 18, header: 'none', footer: 'contact', pageNumbers: 'page', pageNumberAlign: 'center' },
    sections: [
      { type: 'cover', options: { variant: 'split', showLogo: true, showFacts: true, showClient: false } },
      { type: 'intro', pageBreak: 'before', options: { variant: 'guide', showContents: false } },
      { type: 'finishes', pageBreak: 'before', options: { variant: 'paired', showCodes: true, showTextures: true, swatchSize: 'l' } },
      { type: 'product_cards', pageBreak: 'before', options: { variant: 'lookbook', columns: 2, drawingSize: 'l', showColorVariants: true, showFromPrice: false, showSizeRange: false, showOpening: true, showQr: false } },
      { type: 'hardware', options: { variant: 'grid', showFinishes: true, showCodes: true } },
      { type: 'glass', options: { variant: 'list', showPerformance: true, showBuildup: false, maxItems: 6 } },
      { type: 'contact', options: { variant: 'card', showQr: true, showAddress: true, showWebsite: false } },
    ],
  },
]

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}

/** Diseños predefinidos (inmutables). Para editar, usa `getDocPreset`/`duplicateDocPreset` (copias). */
export const DOC_PRESETS: Readonly<Record<DocPresetId, DocTemplate>> = deepFreeze(
  Object.fromEntries(PRESET_INPUTS.map((p) => [p.id, preset(p)])) as Record<DocPresetId, DocTemplate>,
)

export interface DocPresetTraits {
  /** Público principal (filtros de la galería). */
  audience: 'residential' | 'premium' | 'trade' | 'architect' | 'contract' | 'dealer'
  /** Peso visual: más dibujo/foto o más planilla. */
  style: 'visual' | 'balanced' | 'technical'
  /** Saca partido a fotos subidas (portada/galería); sin fotos usa dibujos. */
  usesPhotos: boolean
  /** Rango de ítems donde luce mejor. */
  idealItems: readonly [number, number]
}

export const DOC_PRESET_TRAITS: Readonly<Record<DocPresetId, DocPresetTraits>> = {
  atelier: { audience: 'premium', style: 'visual', usesPhotos: false, idealItems: [1, 16] },
  corporativa: { audience: 'contract', style: 'balanced', usesPhotos: false, idealItems: [4, 120] },
  obra: { audience: 'trade', style: 'technical', usesPhotos: false, idealItems: [4, 400] },
  hogar: { audience: 'residential', style: 'visual', usesPhotos: false, idealItems: [1, 24] },
  memoria: { audience: 'architect', style: 'technical', usesPhotos: false, idealItems: [1, 40] },
  habitar: { audience: 'residential', style: 'visual', usesPhotos: true, idealItems: [3, 40] },
  sistema: { audience: 'architect', style: 'technical', usesPhotos: false, idealItems: [3, 80] },
  'coleccion-modular': { audience: 'dealer', style: 'balanced', usesPhotos: false, idealItems: [4, 120] },
  'materia-y-color': { audience: 'premium', style: 'visual', usesPhotos: true, idealItems: [3, 40] },
}

/** Copia editable de un diseño predefinido. */
export function getDocPreset(id: DocPresetId): DocTemplate {
  return cloneJson(DOC_PRESETS[id]) as DocTemplate
}

export function docPresetsFor(kind: DocTemplateKind): DocTemplate[] {
  return DOC_PRESET_IDS.filter((id) => presetKind(id) === kind).map((id) => getDocPreset(id))
}

/** Diseño predefinido equivalente a un id v4 (`esencial` → `luz`…), o `undefined`. */
export function presetForLegacyId(id: unknown): DocPresetId | undefined {
  if (isDocPresetId(id)) return id
  return isLegacyTemplateId(id) ? LEGACY_TEMPLATE_PRESETS[id] : undefined
}

/**
 * Duplica un diseño predefinido como plantilla propia (el servidor asigna el id definitivo).
 * Conserva `presetId` para poder restablecerlo.
 */
export function duplicateDocPreset(presetId: DocPresetId, input: { id: string; name?: string }): DocTemplate {
  const base = getDocPreset(presetId)
  return { ...base, id: input.id, name: input.name ?? base.name, presetId }
}
