import { NavLink, useMatch, useNavigate } from 'react-router'
import { Building2, ChevronsUpDown, CreditCard, PanelLeftClose, PanelLeftOpen, Search, UserPlus } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useSession } from '../../lib/auth'
import { useGlossary, useT } from '../../lib/i18n'
import { describePlan } from '../../lib/plan'
import { useShellStore } from '../../lib/stores'
import {
  Badge,
  DekopenLogo,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Kbd,
  Tooltip,
} from '../../ui'
import es from '../i18n/es'
import { MAIN_NAV, SETTINGS_NAV, type NavItem } from './nav'
import { PlanUsage } from './PlanUsage'

function NavRow({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const t = useT(es)
  const Icon = item.icon
  const label = t(`nav.${item.id}`)
  // Estado activo calculado aquí: el Tooltip (Slot de Radix) no admite className como función.
  const isActive = useMatch({ path: item.to, end: false }) !== null
  const link = (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={cn(
        'group relative flex h-8 items-center gap-2.5 rounded-sm text-base transition-colors duration-100 ease-out touch:h-10',
        collapsed ? 'w-9 justify-center' : 'px-2',
        isActive ? 'bg-nav-active font-medium text-nav-active-fg shadow-raised' : 'text-fg hover:bg-frame-hover hover:text-fg-strong',
      )}
    >
      <Icon
        aria-hidden
        strokeWidth={1.75}
        className={cn('size-4 shrink-0', isActive ? 'text-nav-active-fg' : 'text-fg-muted group-hover:text-fg')}
      />
      {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </NavLink>
  )
  return collapsed ? (
    <Tooltip content={label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}

/** Lista de navegación reutilizada por la barra lateral y la hoja móvil. */
export function NavList({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <ul className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>
      {MAIN_NAV.map((item) => (
        <li key={item.to}>
          <NavRow item={item} collapsed={collapsed} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  )
}

export function SettingsNavRow({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return <NavRow item={SETTINGS_NAV} collapsed={collapsed} onNavigate={onNavigate} />
}

/** Placa cuadrada de la empresa: su logo si lo tiene, si no sus iniciales sobre tinta. */
export function OrgTile({ name, logo, size = 24 }: { name: string; logo?: string | null; size?: number }) {
  const letters =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toLocaleUpperCase() || '·'
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-accent text-micro font-semibold text-fg-on-accent"
      style={{ width: size, height: size }}
    >
      {logo ? <img src={logo} alt="" className="size-full bg-surface object-contain p-0.5" /> : letters}
    </span>
  )
}

/** Empresa arriba de la barra: datos, plan y equipo a un clic. */
function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const t = useT(es)
  const g = useGlossary()
  const me = useSession()
  const navigate = useNavigate()
  const plan = describePlan(me.billing)
  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={me.org.name}
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-sm py-1 text-fg-strong transition-colors duration-100 hover:bg-frame-hover data-[state=open]:bg-frame-hover',
          collapsed ? 'size-9 justify-center' : 'h-9 flex-1 px-1.5',
        )}
      >
        <OrgTile name={me.org.name} logo={me.org.logo} />
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-base font-medium">{me.org.name}</span>
            <ChevronsUpDown aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0 text-fg-muted" />
          </>
        )}
      </button>
    </DropdownMenuTrigger>
  )
  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip content={me.org.name} side="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="start" className="w-64">
        <div className="flex items-center gap-2.5 px-2 pt-2 pb-2.5">
          <OrgTile name={me.org.name} logo={me.org.logo} size={32} />
          <div className="min-w-0">
            <div className="truncate font-medium text-fg-strong">{me.org.name}</div>
            <Badge tone={plan.isTrial ? 'accent' : 'neutral'} size="sm" className="mt-0.5">
              {g.plan(plan.code)}
            </Badge>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={Building2} onSelect={() => navigate('/ajustes/empresa')}>
          {t('account.company')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={CreditCard} onSelect={() => navigate('/ajustes/plan')}>
          {t('account.plan')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={UserPlus} onSelect={() => navigate('/ajustes/equipo')}>
          {me.solo ? t('settings.inviteSomeone') : t('settings.equipo.label')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Barra lateral compacta y colapsable (atajo «[»): empresa, búsqueda, secciones, uso del plan y ajustes. */
export function Sidebar() {
  const t = useT(es)
  const collapsed = useShellStore((s) => s.sidebarCollapsed)
  const toggle = useShellStore((s) => s.toggleSidebar)
  const setCommandOpen = useShellStore((s) => s.setCommandOpen)

  const search = (
    <button
      type="button"
      onClick={() => setCommandOpen(true)}
      aria-label={t('shell.search')}
      className={cn(
        'group flex h-8 items-center gap-2.5 rounded-sm text-fg-muted transition-colors duration-100 ease-out hover:bg-frame-hover hover:text-fg-strong touch:h-10',
        collapsed ? 'w-9 justify-center' : 'w-full px-2',
      )}
    >
      <Search aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left text-base">{t('shell.searchShort')}</span>
          <Kbd combo="mod+k" />
        </>
      )}
    </button>
  )

  return (
    <aside
      data-frame
      aria-label={t('shell.mainNav')}
      className={cn(
        'hidden shrink-0 flex-col overflow-hidden bg-frame transition-[width] duration-180 ease-standard md:flex',
        collapsed ? 'w-14 items-center' : 'w-[224px]',
      )}
    >
      {/* El nombre del taller manda: el botón de colapsar aparece al pasar por encima para no comerle ancho. */}
      <div className={cn('group/head relative flex h-12 shrink-0 items-center', collapsed ? 'justify-center' : 'pr-2 pl-2')}>
        <OrgSwitcher collapsed={collapsed} />
        {collapsed ? null : (
          <IconButton
            icon={PanelLeftClose}
            label={t('shell.collapse')}
            shortcut="["
            size="sm"
            tooltipSide="right"
            onClick={toggle}
            className="absolute right-3 bg-frame-hover opacity-0 transition-opacity duration-100 group-focus-within/head:opacity-100 group-hover/head:opacity-100 touch:opacity-100"
          />
        )}
      </div>

      <div className={cn('shrink-0 pt-1 pb-1', collapsed ? 'flex justify-center px-2' : 'px-2')}>
        {collapsed ? (
          <Tooltip content={t('shell.search')} shortcut="mod+k" side="right">
            {search}
          </Tooltip>
        ) : (
          search
        )}
      </div>

      <nav aria-label={t('shell.sections')} className={cn('flex min-h-0 flex-1 flex-col pb-3', collapsed ? 'px-2' : 'px-2')}>
        <NavList collapsed={collapsed} />
        <div className={cn('mt-auto flex flex-col gap-1', collapsed && 'items-center')}>
          <PlanUsage collapsed={collapsed} />
          <SettingsNavRow collapsed={collapsed} />
          {collapsed ? (
            <IconButton icon={PanelLeftOpen} label={t('shell.expand')} shortcut="[" size="md" tooltipSide="right" onClick={toggle} />
          ) : (
            <div aria-hidden className="px-2 pt-3 text-fg-muted">
              <DekopenLogo size="sm" />
            </div>
          )}
        </div>
      </nav>
    </aside>
  )
}
