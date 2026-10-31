import { Factory, FileText, House, LayoutTemplate, Library, Settings2, Users, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Palabras extra para la paleta ⌘K. */
  keywords?: string[]
}

/** Navegación principal (SPEC §4). */
export const MAIN_NAV: NavItem[] = [
  { to: '/inicio', label: 'Inicio', icon: House, keywords: ['panel', 'resumen', 'hoy'] },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText, keywords: ['presupuestos', 'obras', 'ventas'] },
  { to: '/clientes', label: 'Clientes', icon: Users, keywords: ['contactos', 'personas'] },
  { to: '/taller', label: 'Taller', icon: Factory, keywords: ['producción', 'ot', 'orden de trabajo', 'cortes'] },
  { to: '/catalogo', label: 'Catálogo', icon: Library, keywords: ['marcas', 'perfiles', 'precios', 'vidrios', 'herrajes'] },
  { to: '/documentos', label: 'Documentos', icon: LayoutTemplate, keywords: ['plantillas', 'pdf', 'diseños'] },
]

export const SETTINGS_NAV: NavItem = { to: '/ajustes', label: 'Ajustes', icon: Settings2, keywords: ['configuración'] }

export interface SettingsSection {
  slug: string
  label: string
  description: string
  /** Solo se muestra si hay más de una persona o el plan lo permite. */
  teamOnly?: boolean
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { slug: 'empresa', label: 'Empresa', description: 'Nombre, RUT, logo, datos de contacto y color de tus documentos.' },
  { slug: 'precios', label: 'Precios', description: 'Margen, mano de obra, instalación, merma, redondeo e IVA.' },
  { slug: 'taller', label: 'Taller', description: 'Largo de barra, corte de sierra, despuntes y retazos.' },
  { slug: 'equipo', label: 'Equipo', description: 'Personas, invitaciones y roles.', teamOnly: true },
  { slug: 'plan', label: 'Plan y facturación', description: 'Tu plan, créditos de Marco, medio de pago y boletas.' },
]
