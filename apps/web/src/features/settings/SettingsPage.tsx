/**
 * Ajustes (SPEC §4): Empresa · Precios · Taller · Equipo · Plan y facturación. Todo se guarda solo;
 * nada es obligatorio para cotizar. El menú es el mismo en todas las secciones: con una sola
 * persona, «Equipo» se llama «Invitar a alguien» (sin roles).
 */
import { useLayoutEffect, useRef, type ComponentType } from 'react'
import { Navigate, NavLink, useParams } from 'react-router'
import { SETTINGS_SECTIONS } from '../../app/shell/nav'
import { useSession } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { usePageTitle } from '../../lib/usePageTitle'
import { Page, PageHeader } from '../../ui'
import { CompanySection } from './sections/CompanySection'
import { PlanSection } from './sections/PlanSection'
import { PricingSection } from './sections/PricingSection'
import { TeamSection } from './sections/TeamSection'
import { WorkshopSection } from './sections/WorkshopSection'

const SECTION_COMPONENTS: Record<string, ComponentType> = {
  empresa: CompanySection,
  precios: PricingSection,
  taller: WorkshopSection,
  equipo: TeamSection,
  plan: PlanSection,
}

export default function SettingsPage() {
  const { section } = useParams()
  const me = useSession()
  // Mismo menú en todas las secciones (nada salta al navegar).
  const label = (s: (typeof SETTINGS_SECTIONS)[number]) => (s.slug === 'equipo' && me.solo ? 'Invitar a alguien' : s.label)
  const current = SETTINGS_SECTIONS.find((s) => s.slug === section)
  const tabsRef = useRef<HTMLDivElement>(null)
  // En pestañas horizontales (teléfono), la sección activa siempre queda a la vista.
  useLayoutEffect(() => {
    const tabs = tabsRef.current
    const active = tabs?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!tabs || !active || tabs.scrollWidth <= tabs.clientWidth) return
    const left = active.offsetLeft - tabs.offsetLeft
    if (left < tabs.scrollLeft || left + active.offsetWidth > tabs.scrollLeft + tabs.clientWidth) tabs.scrollLeft = Math.max(0, left - 16)
  }, [section])
  usePageTitle(current ? `Ajustes · ${label(current)}` : 'Ajustes')
  if (!current) return <Navigate to="/ajustes/empresa" replace />
  const Section = SECTION_COMPONENTS[current.slug] ?? CompanySection

  return (
    <Page width="wide">
      <PageHeader title="Ajustes" description="Todo se guarda solo. Puedes cambiarlo cuando quieras." className="pb-5" />
      {/* Pestañas horizontales hasta xl (así el formulario conserva el ancho); menú lateral desde 1280 px. */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[200px_minmax(0,1fr)] xl:gap-12">
        <nav aria-label="Secciones de ajustes" className="-mx-4 min-w-0 px-4 sm:mx-0 sm:px-0">
          <div ref={tabsRef} className="scrollbar-quiet flex gap-1 overflow-x-auto border-b border-paper-200 pb-2 xl:flex-col xl:overflow-visible xl:border-b-0 xl:pb-0">
            {SETTINGS_SECTIONS.map((s) => (
              <NavLink
                key={s.slug}
                to={`/ajustes/${s.slug}`}
                className={({ isActive }) =>
                  cn(
                    'flex h-8 shrink-0 items-center rounded-sm px-2.5 text-base whitespace-nowrap transition-colors duration-120 touch:h-10',
                    isActive ? 'bg-paper-100 font-medium text-paper-900' : 'text-paper-600 hover:bg-paper-100 hover:text-paper-900',
                  )
                }
              >
                {label(s)}
              </NavLink>
            ))}
          </div>
        </nav>
        <section aria-labelledby="settings-title" className="min-w-0">
          <Section key={current.slug} />
        </section>
      </div>
    </Page>
  )
}
