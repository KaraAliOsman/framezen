import { Factory, FileText, House, LayoutTemplate, Library, Settings2, Users, type LucideIcon } from 'lucide-react'
import { translate } from '../../lib/i18n'
import es from '../i18n/es'

export type NavId = keyof typeof es.nav

export interface NavItem {
  /** Identidad estable (clave de i18n). */
  id: NavId
  /** Ruta (slug en español, estable: no se traduce). */
  to: string
  /** Texto en el idioma actual (se lee al dibujar: los componentes que lo muestran usan `useT`). */
  readonly label: string
  icon: LucideIcon
  /** Palabras extra para la paleta ⌘K, en el idioma actual. */
  readonly keywords: string[]
}

function navItem(id: NavId, to: string, icon: LucideIcon): NavItem {
  return {
    id,
    to,
    icon,
    get label() {
      return translate(es, `nav.${id}`)
    },
    get keywords() {
      return translate(es, `navKeywords.${id}`)
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    },
  }
}

/** Navegación principal (SPEC §4). */
export const MAIN_NAV: NavItem[] = [
  navItem('home', '/inicio', House),
  navItem('quotes', '/cotizaciones', FileText),
  navItem('clients', '/clientes', Users),
  navItem('workshop', '/taller', Factory),
  navItem('catalog', '/catalogo', Library),
  navItem('documents', '/documentos', LayoutTemplate),
]

export const SETTINGS_NAV: NavItem = navItem('settings', '/ajustes', Settings2)

export type SettingsSlug = keyof Omit<typeof es.settings, 'inviteSomeone'>

export interface SettingsSection {
  /** Slug estable en español (`/ajustes/<slug>`); mismos que `features/settings/sections.ts`. */
  slug: SettingsSlug
  readonly label: string
  readonly description: string
  /** Con una sola persona se presenta como «Invitar a alguien». */
  teamOnly?: boolean
}

function section(slug: SettingsSlug, teamOnly?: boolean): SettingsSection {
  return {
    slug,
    ...(teamOnly ? { teamOnly } : {}),
    get label() {
      return translate(es, `settings.${slug}.label`)
    },
    get description() {
      return translate(es, `settings.${slug}.description`)
    },
  }
}

/** Secciones de Ajustes en el orden del menú (contrato de slugs con UI-SETTINGS). */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  section('empresa'),
  section('precios'),
  section('taller'),
  section('idioma'),
  section('plantillas'),
  section('texturas'),
  section('pagos'),
  section('asistentes'),
  section('ia'),
  section('apariencia'),
  section('equipo', true),
  section('plan'),
]

/** Etiqueta de una sección según el equipo: con una sola persona, «Equipo» es «Invitar a alguien». */
export function settingsSectionLabel(s: SettingsSection, solo: boolean): string {
  return s.slug === 'equipo' && solo ? translate(es, 'settings.inviteSomeone') : s.label
}
