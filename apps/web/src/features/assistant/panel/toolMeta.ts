/**
 * Dominio de una herramienta del servidor (por su nombre): ícono y frases de la línea de actividad.
 * Los nombres los define el registro del servidor; aquí solo se agrupan por palabras clave, así una
 * herramienta nueva cae en su dominio sin tocar el panel.
 */
import type { LucideIcon } from 'lucide-react'
import { BookMarked, ChartColumn, Compass, Search, Send, Settings2, UsersRound, Wrench } from 'lucide-react'
import { IconFoil, IconMiterSaw, IconProfileSection, IconQuoteDocument, IconSash, IconTemplate } from '../../../ui/icons'

export type ToolDomain =
  | 'quote'
  | 'item'
  | 'client'
  | 'catalog'
  | 'document'
  | 'template'
  | 'texture'
  | 'settings'
  | 'workshop'
  | 'stats'
  | 'memory'
  | 'search'
  | 'navigate'
  | 'send'
  | 'generic'

const RULES: [RegExp, ToolDomain][] = [
  [/send|share|whatsapp|email|mail|link/, 'send'],
  [/remember|recall|forget|memory/, 'memory'],
  [/navigate|open_|select_|highlight|set_ui|set_theme|set_locale/, 'navigate'],
  [/search|find|lookup/, 'search'],
  [/stat|sales|report|conversion|summary/, 'stats'],
  [/template/, 'template'],
  [/document|pdf|override/, 'document'],
  [/texture|color|colour|foil/, 'texture'],
  [/window|item|typology|opening/, 'item'],
  [/quote|discount|margin|title|note/, 'quote'],
  [/client|customer|contact/, 'client'],
  [/catalog|price|profile|glass|line|hardware|accessor/, 'catalog'],
  [/work_order|workshop|production|cut/, 'workshop'],
  [/setting|pricing|default|locale|currency|tax/, 'settings'],
]

export function toolDomain(tool: string): ToolDomain {
  const name = tool.toLowerCase()
  for (const [re, domain] of RULES) if (re.test(name)) return domain
  return 'generic'
}

export const DOMAIN_ICONS: Record<ToolDomain, LucideIcon> = {
  quote: IconQuoteDocument,
  item: IconSash,
  client: UsersRound,
  catalog: IconProfileSection,
  document: IconQuoteDocument,
  template: IconTemplate,
  texture: IconFoil,
  settings: Settings2,
  workshop: IconMiterSaw,
  stats: ChartColumn,
  memory: BookMarked,
  search: Search,
  navigate: Compass,
  send: Send,
  generic: Wrench,
}
