import { eq } from 'drizzle-orm'
import { DEFAULT_CUT, DEFAULT_PRICING } from '@framezen/engine'
import type { DocumentPrefs, OrgSettings } from '@framezen/shared'
import type { Db } from '../db/client'
import { orgSettings, type StoredSettings } from '../db/schema'
import { deepMerge } from '../lib/merge'

/** Textos por defecto de los documentos: cálidos, claros y listos para enviar. */
export const DEFAULT_DOCUMENTS: DocumentPrefs = {
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
  validityDays: 15,
  leadTimeText: 'Fabricación e instalación en 15 días hábiles desde la aceptación y el abono.',
}

export function defaultStoredSettings(): StoredSettings {
  return {
    pricing: { ...DEFAULT_PRICING },
    cut: { ...DEFAULT_CUT },
    documents: { ...DEFAULT_DOCUMENTS },
    defaults: {},
  }
}

/** Completa lo guardado con los valores por defecto actuales (por si se agregaron claves nuevas). */
export function withDefaults(stored: Partial<StoredSettings> | null | undefined): StoredSettings {
  return deepMerge(defaultStoredSettings(), stored ?? {})
}

export async function getSettings(db: Db, orgId: string): Promise<OrgSettings> {
  const [row] = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).limit(1)
  const data = withDefaults(row?.data)
  return { ...data, nextQuoteNumber: row?.nextQuoteNumber ?? 1, nextWorkOrderNumber: row?.nextWorkOrderNumber ?? 1 }
}
