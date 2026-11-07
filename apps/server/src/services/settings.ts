import { eq } from 'drizzle-orm'
import { DEFAULT_CUT, DEFAULT_PRICING } from '@dekopen/engine'
import { DEFAULT_PAYMENTS, DEFAULT_SENDING, type DocumentPrefs, type OrgSettings } from '@dekopen/shared'
import type { Db } from '../db/client'
import { orgSettings, type StoredSettings } from '../db/schema'
import { deepMerge } from '../lib/merge'
import { cleanSeededPrefs } from '@dekopen/shared'

/** Ajustes de documentos de una cuenta nueva: sin textos escritos por DEKOPEN. */
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
  // Los compromisos son del taller: arrancan vacíos y una sección vacía no se imprime.
  intro: '',
  conditions: '',
  paymentTerms: '',
  warranty: '',
  validityDays: 0,
  leadTimeText: '',
}

export function defaultStoredSettings(): StoredSettings {
  return {
    pricing: { ...DEFAULT_PRICING },
    cut: { ...DEFAULT_CUT },
    documents: { ...DEFAULT_DOCUMENTS },
    defaults: {},
    sending: { ...DEFAULT_SENDING, templates: {} },
    payments: { ...DEFAULT_PAYMENTS, accounts: [], links: [], deposit: { ...DEFAULT_PAYMENTS.deposit } },
  }
}

/** Completa lo guardado con los valores por defecto actuales (por si se agregaron claves nuevas). */
export function withDefaults(stored: Partial<StoredSettings> | null | undefined): StoredSettings {
  return deepMerge(defaultStoredSettings(), stored ?? {})
}

export async function getSettings(db: Db, orgId: string): Promise<OrgSettings> {
  const [row] = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).limit(1)
  const data = withDefaults(row?.data)
  // Lo que sembramos hasta v6 y nadie tocó no es del taller: se limpia al leer.
  return { ...data, documents: cleanSeededPrefs(data.documents), nextQuoteNumber: row?.nextQuoteNumber ?? 1, nextWorkOrderNumber: row?.nextWorkOrderNumber ?? 1 }
}
