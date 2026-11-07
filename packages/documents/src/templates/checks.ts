/**
 * Lo que el taller debería completar antes de enviar. DEKOPEN no escribe compromisos por nadie: lo que
 * falta no se inventa ni se imprime, se avisa aquí. Puro: lo usan el editor y el diálogo de envío.
 */
import type { DocSectionType } from '@dekopen/shared'
import type { QuoteModel } from './model'

export type DocCheckCode = 'pending_price' | 'validity' | 'warranty' | 'payment' | 'lead_time' | 'conditions' | 'blank' | 'brand_logo' | 'hardware_logo'

export interface DocCheck {
  code: DocCheckCode
  /** Marca sin logo (`brand_logo`). */
  brand?: string
  /** Ítems con precio pendiente (`pending_price`). */
  count?: number
  /** Texto con espacios por completar (`blank`). */
  field?: 'paymentTerms' | 'warranty' | 'leadTimeText' | 'conditions' | 'includes' | 'excludes'
}

/** Espacios de una ayuda aceptada que nadie completó («[__] años»). */
const BLANK = /\[\s*_*\s*\]/

export function quoteDocChecks(m: QuoteModel): DocCheck[] {
  const on = (type: DocSectionType) => m.template.sections.some((s) => s.type === type && s.enabled)
  const out: DocCheck[] = []
  const termsBlocks = m.template.sections.find((s) => s.type === 'terms' && s.enabled)
  const hasBlock = (block: string) => termsBlocks?.type === 'terms' && (termsBlocks.options.blocks as readonly string[]).includes(block)
  const pending = m.items.filter((i) => i.pending && i.included !== false).length
  if (pending) out.push({ code: 'pending_price', count: pending })
  if (!m.validUntil) out.push({ code: 'validity' })
  if (on('warranty') && !m.texts.warranty) out.push({ code: 'warranty' })
  if (on('payment') && !m.texts.paymentTerms) out.push({ code: 'payment' })
  if (hasBlock('lead_time') && !m.texts.leadTimeText) out.push({ code: 'lead_time' })
  if (hasBlock('conditions') && !m.texts.conditions) out.push({ code: 'conditions' })
  for (const field of ['paymentTerms', 'warranty', 'leadTimeText', 'conditions', 'includes', 'excludes'] as const) {
    if (BLANK.test(m.texts[field])) out.push({ code: 'blank', field })
  }
  for (const brand of m.brandsWithoutLogo) out.push({ code: 'brand_logo', brand })
  if (m.settings.brandHardware && m.brands.hardware.length === 0) out.push({ code: 'hardware_logo' })
  return out
}
