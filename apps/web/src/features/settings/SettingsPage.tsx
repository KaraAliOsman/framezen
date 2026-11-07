/**
 * Ajustes: Empresa · Precios · Taller · Idioma y región · Plantillas · Texturas · Asistentes · IA ·
 * Apariencia · Equipo · Plan y facturación. Todo se guarda solo; nada es obligatorio para cotizar. El menú es el
 * mismo en todas las secciones: con una sola persona, «Equipo» se llama «Invitar a alguien».
 */
import { useLayoutEffect, useRef, type ComponentType } from 'react'
import { Navigate, NavLink, useParams } from 'react-router'
import { useSession } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { useT } from '../../lib/i18n'
import { usePageTitle } from '../../lib/usePageTitle'
import { Page, PageHeader } from '../../ui'
import es from './i18n/es'
import { DEFAULT_SETTINGS_SLUG, isSettingsSlug, SETTINGS_GROUPS, SETTINGS_ORDER, type SettingsSlug } from './sections'
import { AiSection } from './sections/AiSection'
import { AppearanceSection } from './sections/AppearanceSection'
import { AssistantsSection } from './sections/AssistantsSection'
import { CompanySection } from './sections/CompanySection'
import { PaymentsSection } from './sections/PaymentsSection'
import { PlanSection } from './sections/PlanSection'
import { PricingSection } from './sections/PricingSection'
import { RegionSection } from './sections/RegionSection'
import { TeamSection } from './sections/TeamSection'
import { TemplatesSection } from './sections/TemplatesSection'
import { TexturesSection } from './sections/TexturesSection'
import { WorkshopSection } from './sections/WorkshopSection'

const SECTION_COMPONENTS: Record<SettingsSlug, ComponentType> = {
  empresa: CompanySection,
  precios: PricingSection,
  taller: WorkshopSection,
  idioma: RegionSection,
  plantillas: TemplatesSection,
  texturas: TexturesSection,
  pagos: PaymentsSection,
  asistentes: AssistantsSection,
  ia: AiSection,
  apariencia: AppearanceSection,
  equipo: TeamSection,
  plan: PlanSection,
}

export default function SettingsPage() {
  const { section } = useParams()
  const me = useSession()
  const t = useT(es)
  const current = isSettingsSlug(section) ? section : null
  // Mismo menú en todas las secciones (nada salta al navegar).
  const label = (slug: SettingsSlug) => (slug === 'equipo' && me.solo ? t('nav.equipoSolo') : t(`nav.${slug}`))
  const tabsRef = useRef<HTMLDivElement>(null)
  // En pestañas horizontales (teléfono y tableta), la sección activa siempre queda a la vista.
  useLayoutEffect(() => {
    const tabs = tabsRef.current
    const active = tabs?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!tabs || !active || tabs.scrollWidth <= tabs.clientWidth) return
    const left = active.offsetLeft - tabs.offsetLeft
    if (left < tabs.scrollLeft || left + active.offsetWidth > tabs.scrollLeft + tabs.clientWidth) tabs.scrollLeft = Math.max(0, left - 16)
  }, [section])
  usePageTitle(current ? t('page.titleWith', { section: label(current) }) : t('page.title'))
  if (!current) return <Navigate to={`/ajustes/${DEFAULT_SETTINGS_SLUG}`} replace />
  const Section = SECTION_COMPONENTS[current]

  return (
    <Page width="wide">
      <PageHeader title={t('page.title')} className="pb-6" />
      {/* Pestañas horizontales hasta xl (así el formulario conserva el ancho); lista lateral desde 1280 px. */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[200px_minmax(0,1fr)] xl:gap-12">
        <nav aria-label={t('page.navLabel')} className="-mx-4 min-w-0 px-4 sm:mx-0 sm:px-0">
          <div ref={tabsRef} className="scrollbar-quiet flex gap-1 overflow-x-auto border-b border-divider pb-2 xl:hidden">
            {SETTINGS_ORDER.map((slug) => (
              <SectionLink key={slug} slug={slug} label={label(slug)} />
            ))}
          </div>
          <div className="hidden xl:sticky xl:top-6 xl:flex xl:flex-col xl:gap-6">
            {SETTINGS_GROUPS.map((group) => (
              <div key={group.id} role="group" aria-labelledby={`settings-group-${group.id}`} className="flex flex-col gap-0.5">
                <p id={`settings-group-${group.id}`} className="mb-1 px-2.5 text-meta text-fg-muted">
                  {t(`groups.${group.id}`)}
                </p>
                {group.slugs.map((slug) => (
                  <SectionLink key={slug} slug={slug} label={label(slug)} />
                ))}
              </div>
            ))}
          </div>
        </nav>
        <section aria-labelledby="settings-title" className="min-w-0">
          <Section key={current} />
        </section>
      </div>
    </Page>
  )
}

function SectionLink({ slug, label }: { slug: SettingsSlug; label: string }) {
  return (
    <NavLink
      to={`/ajustes/${slug}`}
      data-settings-section={slug}
      className={({ isActive }) =>
        cn(
          'flex h-8 shrink-0 items-center rounded-sm px-2.5 text-base whitespace-nowrap transition-colors duration-100 ease-out touch:h-10',
          isActive ? 'bg-hover font-medium text-fg-strong' : 'text-fg-muted hover:bg-hover/70 hover:text-fg',
        )
      }
    >
      <span className="truncate">{label}</span>
    </NavLink>
  )
}
