/**
 * Utilidades comunes de las secciones: armado de bloques con su aire, título de sección (propio de la
 * plantilla o el traducido por defecto, editable en el editor de plantillas) y métricas de texto del
 * tema para estimar altos.
 */
import type { ReactNode } from 'react'
import { DOC_FONTS, type DocFontId, type DocSection } from '@dekopen/shared'
import { EditableText } from '../../base/editable'
import type { FlowBlock } from '../flow'
import type { QuoteModel } from '../model'
import { fillLine, SectionHeading } from '../parts'
import { metricsFor, textHeight, type TextMetrics } from '../measure'

export interface SectionCtx {
  /** Posición entre las secciones visibles. */
  index: number
  /** Número visible de la sección (estilos técnicos numeran sus capítulos). */
  number: number
  /** Primera sección del cuerpo (sin aire antes). */
  first: boolean
}

export type SectionRenderer = (section: DocSection, m: QuoteModel, ctx: SectionCtx) => FlowBlock[]

export interface BlockOptions {
  keepWithNext?: boolean
  breakBefore?: boolean
  page?: FlowBlock['page']
  bleed?: boolean
  group?: string
  thead?: boolean
  /** Aire propio antes del bloque (si no: sección o separación interna). */
  space?: number
}

/** Constructor de bloques de una sección: el primero lleva el aire de sección; los demás, el interno. */
export function sectionBlocks(section: DocSection, m: QuoteModel, ctx: SectionCtx) {
  const list: FlowBlock[] = []
  const d = m.tokens.density
  let breakPending = section.pageBreak === 'before'
  const sideHead = hasSideHeading(section, m)
  return {
    list,
    add(key: string, node: ReactNode, height: number, options: BlockOptions = {}) {
      const first = list.length === 0
      // Con título al margen, el contenido parte a la altura del título.
      const beside = sideHead && list.length === 1 && list[0].key === `${section.id}:head`
      const space = beside ? 0 : (options.space ?? (first ? (ctx.first ? 0 : d.section) : d.gap))
      const block: FlowBlock = {
        key: `${section.id}:${key}`,
        sectionId: section.id,
        sectionType: section.type,
        node,
        height: Math.max(0, Math.ceil(height)),
        space,
        tone: section.tone,
      }
      if (options.keepWithNext) block.keepWithNext = true
      if (options.breakBefore || breakPending) block.breakBefore = true
      if (breakPending && !options.breakBefore) block.softBreak = true
      breakPending = false
      if (options.page) block.page = options.page
      if (options.bleed) block.bleed = true
      if (options.group) block.group = options.group
      if (options.thead) block.thead = true
      list.push(block)
      return block
    },
  }
}

/** Métricas del texto de cuerpo, chico y rótulo del tema. */
export function textMetrics(m: QuoteModel) {
  const s = m.tokens.scale
  const body = m.tokens.fonts.body as DocFontId
  const heading = m.tokens.fonts.heading as DocFontId
  return {
    body: metricsFor(body, s.body, s.lineHeight),
    small: metricsFor(body, s.small, 1.45),
    label: metricsFor(body, s.label, 1.35),
    h3: metricsFor(heading, s.h3, 1.25),
    h2: metricsFor(heading, s.h2 * m.tokens.headingOptical, 1.18),
    h1: metricsFor(heading, s.h1 * m.tokens.headingOptical, 1.1),
    display: metricsFor(heading, s.display * m.tokens.headingOptical, 1.04),
  }
}

export function lineH(metrics: TextMetrics): number {
  return metrics.size * metrics.lineHeight
}

/** Título efectivo de la sección (texto propio con marcadores o el predeterminado del idioma). */
export function sectionTitle(section: DocSection, m: QuoteModel, fallback?: string): string {
  if (section.title) return fillLine(section.title, m.placeholders)
  if (fallback) return fallback
  const key = `sections.${section.type}`
  return m.kit.t.has(key) ? m.kit.t(key as Parameters<typeof m.kit.t>[0]) : ''
}

/** Número de capítulo en las composiciones numeradas. */
export function sectionKicker(m: QuoteModel, ctx: SectionCtx): string | undefined {
  return m.tokens.composition.numbered ? String(ctx.number) : undefined
}

/** Título en la columna del margen (salvo las ventanas, que usan todo el ancho). */
export function hasSideHeading(section: DocSection, m: QuoteModel): boolean {
  return m.tokens.composition.sideHeadings && section.type !== 'items'
}

/** Bloque de título de sección (viaja con lo que sigue). */
export function headingNode(section: DocSection, m: QuoteModel, ctx: SectionCtx, opts: { fallback?: string; aside?: ReactNode; guide?: boolean } = {}): { node: ReactNode; height: number } {
  const title = sectionTitle(section, m, opts.fallback)
  const t = textMetrics(m)
  const kicker = sectionKicker(m, ctx)
  const editableTitle = m.onSectionEdit ? (
    <EditableText as="span" inline value={section.title ?? title} editable onChange={(v) => m.onSectionEdit?.(section.id, 'title', v === title ? '' : v)} placeholder={title} display={title} />
  ) : (
    title
  )
  const side = hasSideHeading(section, m)
  const ruleBelow = m.theme.rules !== 'none'
  const height = side ? 0 : Math.ceil(lineH(t.h2) * Math.min(2, Math.max(1, Math.ceil((title.length * t.h2.size * t.h2.charWidth) / Math.max(200, m.page.contentWidth - 220))))) + (ruleBelow ? 11 : 0)
  const node = <SectionHeading title={editableTitle} kicker={kicker} aside={opts.aside} editable={!!m.onSectionEdit} side={side} />
  return { node: opts.guide ? <div className="dkd-guide">{node}</div> : node, height }
}

/** Alto de un texto de cuerpo en un ancho. */
export function bodyHeight(m: QuoteModel, text: string, width: number, kind: 'body' | 'small' = 'body'): number {
  const t = textMetrics(m)
  return textHeight(text, width, kind === 'body' ? t.body : t.small)
}

export function isSerif(font: DocFontId): boolean {
  return DOC_FONTS[font]?.category === 'serif'
}
