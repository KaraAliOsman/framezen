/**
 * Textos humanos del catálogo (nunca códigos internos): estado de los datos de una línea o
 * marca, tipo de marca, roles de perfil y familias de descuento.
 */
import type { Brand, BrandSettings, Line, ProfileRole } from '@framezen/engine'
import { initials } from '../../../lib/format'
import type { BadgeTone } from '../../../ui'

export type Completeness = 'verified' | 'complete' | 'partial' | 'none'

export const COMPLETENESS_COPY: Record<Completeness, { label: string; tone: BadgeTone; help: string }> = {
  verified: {
    label: 'Verificada en taller',
    tone: 'ok',
    help: 'Lista para cotizar y con cortes comprobados al 0,1 mm contra una orden de trabajo real.',
  },
  complete: {
    label: 'Lista para cotizar',
    tone: 'ok',
    help: 'Una ventana completa sale con todos sus perfiles, refuerzos y herrajes con precio. Revisa la primera que fabriques.',
  },
  partial: {
    label: 'Cotiza con avisos',
    tone: 'warn',
    help: 'Faltan algunos precios o datos del fabricante. Cotizas igual y te avisamos qué falta antes de cortar.',
  },
  none: {
    label: 'Solo artículos',
    tone: 'neutral',
    help: 'Esta marca trae herrajes, accesorios o vidrios, sin líneas de perfiles.',
  },
}

/** «Solo medidas»: la marca trae líneas, pero ningún precio. */
export const GEOMETRY_ONLY_COPY = {
  label: 'Solo medidas',
  tone: 'neutral' as BadgeTone,
  help: 'Sus líneas traen medidas y pautas, pero no precios: dibuja y corta, y carga tus precios para cotizar con costo real.',
}

/** Estado de una marca en palabras, con los conteos que entrega el servidor. */
export function brandStateCopy(summary: { completeness: Completeness; counts: { lines: number; priced: number } }): { label: string; tone: BadgeTone; help: string } {
  if (summary.completeness !== 'none' && summary.counts.lines > 0 && summary.counts.priced === 0) return GEOMETRY_ONLY_COPY
  return COMPLETENESS_COPY[summary.completeness]
}

export function lineCompleteness(line: Pick<Line, 'completeness'>): Completeness {
  return line.completeness ?? 'partial'
}

export const BRAND_KIND_LABEL: Record<Brand['kind'], string> = {
  profiles: 'Perfiles',
  glass: 'Vidrios',
  hardware: 'Herrajes',
  mixed: 'Perfiles y herrajes',
}

export const LINE_KIND_LABEL: Record<Line['kind'], string> = {
  casement: 'Practicable',
  sliding: 'Corredera',
}

export const MATERIAL_LABEL: Record<Line['material'], string> = { pvc: 'PVC', aluminum: 'Aluminio' }

export const ROLE_LABEL: Record<ProfileRole, string> = {
  frame: 'Marco',
  sash: 'Hoja',
  door_sash: 'Hoja de puerta',
  mullion: 'Travesaño',
  bead: 'Junquillo',
  french_mullion: 'Inversor',
  threshold: 'Umbral',
  sliding_frame: 'Marco de corredera',
  sliding_sash: 'Hoja de corredera',
  interlock: 'Traslapo central',
  guide: 'Guía',
  coupler: 'Unión',
  reinforcement: 'Refuerzo',
  other: 'Otro',
}

export type DiscountFamily = keyof BrandSettings['discounts']

export const DISCOUNT_FAMILIES: { key: DiscountFamily; label: string; help: string }[] = [
  { key: 'profiles', label: 'Perfiles', help: 'Marco, hoja, junquillo' },
  { key: 'reinforcement', label: 'Refuerzos', help: 'Acero interior' },
  { key: 'hardware', label: 'Herrajes', help: 'Cremonas, bisagras, carros' },
  { key: 'glass', label: 'Vidrios', help: 'Termopaneles y simples' },
  { key: 'accessories', label: 'Accesorios', help: 'Burletes, tornillos, tapas' },
]

/** Fuente de datos de una línea en una frase corta («Pauta de la distribuidora · lista del 31-10-2026»). */
export function sourceSentence(line: Pick<Line, 'source'>): string | null {
  const source = line.source?.trim()
  if (!source) return null
  return (
    source
      .replace(/^plantilla genérica$/i, 'Plantilla típica de Framezen')
      // Catálogos generados antes citaban la orden de trabajo de un tercero («+ OT N° 385 …»):
      // el taller solo ve que Framezen verificó la pauta.
      .replace(/\s*\+\s*OT N° ?\d+\s*\(un caso verificado\)/i, ', verificada por Framezen en una ventana real')
      .replace(/\s*\+\s*OT N° ?\d+[^·]*?(?=\s*(?:·|$))/i, ', verificada por Framezen')
      .replace(/\s+·\s+/g, ' · ')
  )
}

/** Color de fondo sobrio y estable para el monograma de una marca (nunca un logo). */
export function monogramTone(brandId: string): { bg: string; fg: string } {
  const palette = [
    { bg: '#E8EDF9', fg: '#1F3AA0' },
    { bg: '#EDE7DF', fg: '#4D3B2A' },
    { bg: '#E3EEE8', fg: '#1D5234' },
    { bg: '#F3E9DA', fg: '#6B3E00' },
    { bg: '#ECE6EF', fg: '#4B2F5E' },
    { bg: '#E6ECEE', fg: '#24434D' },
    { bg: '#F1E5E2', fg: '#7A2E22' },
  ]
  let hash = 0
  for (let i = 0; i < brandId.length; i++) hash = (hash * 31 + brandId.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

/**
 * Iniciales de la marca: su monograma o las de su nombre. Con `siblings` (las marcas de la lista,
 * en orden de prioridad: ver `monogramOrder`) no repite iniciales: si «Winhouse» ya es «WI», «Winsa»
 * pasa a «WA». El importador pone a cada marca las dos primeras letras como monograma, así que esos
 * también se desempatan.
 */
export function monogramText(
  brand: Pick<Brand, 'name' | 'monogram'> & { id?: string },
  siblings?: readonly Pick<Brand, 'id' | 'name' | 'monogram'>[],
): string {
  if (!siblings || !brand.id) return baseMonogram(brand)
  const taken = new Set<string>()
  for (const b of siblings) {
    const base = baseMonogram(b)
    const mono = taken.has(base) ? initials(b.name, { avoid: taken }) : base
    if (b.id === brand.id) return mono
    taken.add(mono)
  }
  return baseMonogram(brand)
}

/**
 * Orden estable para `monogramText`: las marcas activas primero (conservan sus iniciales y así
 * coinciden con la pestaña Líneas, que solo ve las activas) y luego el resto, cada grupo por id.
 */
export function monogramOrder<T extends Pick<Brand, 'id'>>(brands: readonly T[], isEnabled: (brand: T) => boolean = () => true): T[] {
  const byId = (a: T, b: T) => a.id.localeCompare(b.id)
  return [...brands.filter(isEnabled).sort(byId), ...brands.filter((b) => !isEnabled(b)).sort(byId)]
}

function baseMonogram(brand: Pick<Brand, 'name' | 'monogram'>): string {
  const own = brand.monogram?.trim()
  if (own) return own.slice(0, 2).toUpperCase()
  const words = brand.name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0] ?? '·').slice(0, 2).toUpperCase()
}
