/**
 * Preferencias de documentos: textos sugeridos (los mismos con que parte cada cuenta) y cómo se
 * aplica una edición hecha directo sobre el documento.
 */
import type { QuoteDocField } from '@framezen/documents'
import type { DocumentPrefs } from '@framezen/shared'

export type TextKey = 'intro' | 'conditions' | 'paymentTerms' | 'warranty' | 'leadTimeText'

/** Textos con que parte una cuenta nueva (apps/server/src/services/settings.ts › DEFAULT_DOCUMENTS). */
export const SUGGESTED_TEXTS: Record<TextKey, string> = {
  intro:
    'Gracias por confiar en nosotros. Te dejamos el detalle de las ventanas que conversamos: medidas, terminaciones y precio de cada una. Si quieres ajustar algo, escríbenos y lo vemos juntos.',
  conditions: [
    '- Precios en pesos chilenos, netos más IVA.',
    '- Antes de fabricar visitamos la obra y confirmamos las medidas finales.',
    '- Cada ventana incluye perfiles, vidrio y herrajes indicados en su detalle.',
    '- La instalación, el retiro de ventanas antiguas y las terminaciones de obra se cobran sólo si aparecen en esta cotización.',
  ].join('\n'),
  paymentTerms: '50 % al aceptar la cotización y 50 % contra entrega.',
  warranty: 'Garantía de 5 años en perfiles y termopaneles, y de 1 año en herrajes e instalación, por defectos de fabricación.',
  leadTimeText: 'Fabricación e instalación en 15 días hábiles desde la aceptación y el abono.',
}

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
  validityDays: 15,
  ...SUGGESTED_TEXTS,
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
