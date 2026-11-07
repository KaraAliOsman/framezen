/**
 * Textos que DEKOPEN sembró en cuentas nuevas hasta v6. Eran compromisos del taller escritos por
 * nosotros (años de garantía, plazo, 50/50) y un saludo que no pertenece al documento. Un texto idéntico
 * al sembrado se limpia al leer; lo que el taller escribió se conserva tal cual. Si dejó intacto alguno
 * de estos compromisos, tampoco eligió la vigencia de 15 días.
 */
import type { DocumentPrefs } from '../api'

export const SEEDED_TEXT_FIELDS = ['intro', 'conditions', 'paymentTerms', 'warranty', 'leadTimeText'] as const
export type SeededTextField = (typeof SEEDED_TEXT_FIELDS)[number]

const SEEDED: Readonly<Record<SeededTextField, string>> = {
  intro: 'Gracias por confiar en nosotros. Te dejamos el detalle de las ventanas que conversamos: medidas, terminaciones y precio de cada una. Si quieres ajustar algo, escríbenos y lo vemos juntos.',
  conditions:
    '- Precios en pesos chilenos, netos más IVA.\n- Antes de fabricar visitamos la obra y confirmamos las medidas finales.\n- Cada ventana incluye perfiles, vidrio y herrajes indicados en su detalle.\n- La instalación, el retiro de ventanas antiguas y las terminaciones de obra se cobran sólo si aparecen en esta cotización.',
  paymentTerms: '50 % al aceptar la cotización y 50 % contra entrega.',
  warranty: 'Garantía de 5 años en perfiles y termopaneles, y de 1 año en herrajes e instalación, por defectos de fabricación.',
  leadTimeText: 'Fabricación e instalación en 15 días hábiles desde la aceptación y el abono.',
}

const SEEDED_VALIDITY = 15
const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

export function isSeededText(field: string, value: unknown): boolean {
  return typeof value === 'string' && Object.hasOwn(SEEDED, field) && squash(value) === squash(SEEDED[field as SeededTextField])
}

/** Quita de los ajustes del documento lo sembrado que nadie tocó. Devuelve la misma referencia si no hay nada. */
export function cleanSeededPrefs<T extends Partial<DocumentPrefs>>(prefs: T): T {
  const seeded = SEEDED_TEXT_FIELDS.filter((f) => isSeededText(f, prefs[f]))
  if (seeded.length === 0) return prefs
  const out: Partial<DocumentPrefs> = { ...prefs }
  for (const field of seeded) out[field] = ''
  const commitments = seeded.some((f) => f === 'paymentTerms' || f === 'warranty' || f === 'leadTimeText')
  if (commitments && prefs.validityDays === SEEDED_VALIDITY) out.validityDays = 0
  return out as T
}
