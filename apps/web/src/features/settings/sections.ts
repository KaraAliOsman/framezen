/**
 * Secciones de Ajustes: slug (estable, en español: va en la URL `/ajustes/<slug>`), grupo e ícono.
 * Los textos viven en `i18n/es.ts` (`nav.<slug>` y `navHint.<slug>`) y se traducen al dibujar.
 *
 * Contrato con UI-SHELL (`app/shell/nav.ts`, paleta ⌘K): los slugs de `SETTINGS_SLUGS` son los
 * únicos válidos; v5 agrega `idioma`, `asistentes`, `ia`, `plantillas` y `texturas`; v8, `apariencia`.
 */
import { Banknote, Building2, Calculator, CreditCard, Gauge, Languages, MessageSquareText, Palette, Users, type LucideIcon } from 'lucide-react'
import { IconFoil, IconMiterSaw, IconTemplate } from '../../ui/icons'

export const SETTINGS_SLUGS = ['empresa', 'precios', 'taller', 'idioma', 'plantillas', 'texturas', 'pagos', 'asistentes', 'ia', 'apariencia', 'equipo', 'plan'] as const
export type SettingsSlug = (typeof SETTINGS_SLUGS)[number]

export const DEFAULT_SETTINGS_SLUG: SettingsSlug = 'empresa'

export type SettingsGroupId = 'business' | 'documents' | 'assistant' | 'account'

export interface SettingsGroup {
  id: SettingsGroupId
  slugs: readonly SettingsSlug[]
}

/** Orden del menú: el negocio primero, luego lo que ve el cliente, el asistente y la cuenta. */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  { id: 'business', slugs: ['empresa', 'precios', 'taller', 'idioma'] },
  { id: 'documents', slugs: ['plantillas', 'texturas', 'pagos'] },
  { id: 'assistant', slugs: ['asistentes', 'ia'] },
  { id: 'account', slugs: ['apariencia', 'equipo', 'plan'] },
]

export const SETTINGS_ICONS: Record<SettingsSlug, LucideIcon> = {
  empresa: Building2,
  precios: Calculator,
  taller: IconMiterSaw,
  idioma: Languages,
  plantillas: IconTemplate,
  texturas: IconFoil,
  pagos: Banknote,
  asistentes: MessageSquareText,
  ia: Gauge,
  apariencia: Palette,
  equipo: Users,
  plan: CreditCard,
}

export function isSettingsSlug(value: unknown): value is SettingsSlug {
  return typeof value === 'string' && (SETTINGS_SLUGS as readonly string[]).includes(value)
}

/** Lista plana en el orden del menú (pestañas del teléfono y la tableta). */
export const SETTINGS_ORDER: readonly SettingsSlug[] = SETTINGS_GROUPS.flatMap((g) => g.slugs)
