import { Link, NavLink, useMatch } from 'react-router'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useSession } from '../../lib/auth'
import { useShellStore } from '../../lib/stores'
import { FramezenMark, IconButton, Tooltip } from '../../ui'
import { MAIN_NAV, SETTINGS_NAV, type NavItem } from './nav'

function NavRow({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  // Estado activo calculado aquí: el Tooltip (Slot de Radix) no admite className como función.
  const isActive = useMatch({ path: item.to, end: false }) !== null
  const link = (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={cn(
        'group flex h-8 items-center gap-2.5 rounded-sm border text-base transition-colors duration-120 ease-out touch:h-10',
        collapsed ? 'w-9 justify-center' : 'px-2',
        isActive
          ? 'border-paper-200 bg-paper-0 font-medium text-paper-900 shadow-[0_1px_1px_rgb(31_28_24/0.04)]'
          : 'border-transparent text-paper-600 hover:bg-paper-100 hover:text-paper-900',
      )}
    >
      <Icon
        aria-hidden
        strokeWidth={1.75}
        className={cn('size-[18px] shrink-0', isActive ? 'text-ink-600' : 'text-paper-600 group-hover:text-paper-900')}
      />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </NavLink>
  )
  return collapsed ? (
    <Tooltip content={item.label} side="right">
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

/** Barra lateral compacta y colapsable (atajo «[»). */
export function Sidebar() {
  const me = useSession()
  const collapsed = useShellStore((s) => s.sidebarCollapsed)
  const toggle = useShellStore((s) => s.toggleSidebar)

  return (
    <aside
      aria-label="Navegación principal"
      className={cn(
        'hidden shrink-0 flex-col border-r border-paper-200 bg-paper-50 md:flex',
        collapsed ? 'w-14 items-center' : 'w-[232px]',
      )}
    >
      <div className={cn('flex h-12 shrink-0 items-center', collapsed ? 'justify-center' : 'justify-between pr-2 pl-3')}>
        <Link
          to="/inicio"
          className="flex min-w-0 items-center gap-2 rounded-sm py-1 text-paper-900"
          aria-label={`${me.org.name} · Inicio`}
        >
          <FramezenMark size={22} />
          {collapsed ? null : <span className="truncate font-semibold tracking-[-0.01em]">{me.org.name}</span>}
        </Link>
        {collapsed ? null : (
          <IconButton icon={PanelLeftClose} label="Contraer barra" shortcut="[" size="sm" tooltipSide="right" onClick={toggle} />
        )}
      </div>

      <nav aria-label="Secciones" className={cn('flex min-h-0 flex-1 flex-col pt-2 pb-3', collapsed ? 'px-2' : 'px-2.5')}>
        <NavList collapsed={collapsed} />
        <div className={cn('mt-auto flex flex-col gap-0.5', collapsed && 'items-center')}>
          <SettingsNavRow collapsed={collapsed} />
          {collapsed ? (
            <IconButton icon={PanelLeftOpen} label="Expandir barra" shortcut="[" size="md" tooltipSide="right" onClick={toggle} />
          ) : null}
        </div>
      </nav>
    </aside>
  )
}
