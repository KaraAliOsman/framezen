/**
 * Preferencias de documentos: textos sugeridos (los mismos con que parte cada cuenta) y cómo se
 * aplica una edición hecha directo sobre el documento.
 */
import type { QuoteDocField } from '@dekopen/documents'
import type { DocumentPrefs } from '@dekopen/shared'


export const DEFAULT_PREFS: DocumentPrefs = {
  quoteTemplate: 'esencial',
  catalogTemplate: 'vitrina',
  font: 'instrument',
  showUnitPrice: true,
  showArea: true,
  showGlass: true,
  showLine: true,
  showColorSwatch: true,
  showExteriorView: false,
  paper: 'letter',
  // Sin compromisos escritos por DEKOPEN: una sección vacía no se imprime.
  intro: '',
  conditions: '',
  paymentTerms: '',
  warranty: '',
  leadTimeText: '',
  validityDays: 0,
}

/** Completa lo guardado con los valores por defecto (por si falta alguna clave). */
export function withDefaultPrefs(prefs: Partial<DocumentPrefs> | undefined | null): DocumentPrefs {
  return { ...DEFAULT_PREFS, ...(prefs ?? {}) }
}

export type DocEditResult = { patch: Partial<DocumentPrefs> } | { ignored: 'quote-field' } | { unchanged: true }

/**
 * Edición directa sobre el documento → cambio de preferencias. El título de la obra y las notas
 * son de cada cotización: aquí no se guardan.
 */
export function applyDocEdit(prefs: DocumentPrefs, field: QuoteDocField, value: string): DocEditResult {
  switch (field) {
    case 'title':
    case 'notes':
    case 'docTitle':
      return { ignored: 'quote-field' }
    case 'validityDays': {
      const days = Number.parseInt(value.replace(/\D+/g, ''), 10)
      if (!Number.isFinite(days) || days === prefs.validityDays) return { unchanged: true }
      return { patch: { validityDays: Math.min(365, Math.max(0, days)) } }
    }
    case 'signatureName':
    case 'footer': {
      const next = value.trim() || undefined
      return next === (prefs[field] ?? undefined) ? { unchanged: true } : { patch: { [field]: next } }
    }
    default: {
      if (value === prefs[field]) return { unchanged: true }
      return { patch: { [field]: value } }
    }
  }
}
