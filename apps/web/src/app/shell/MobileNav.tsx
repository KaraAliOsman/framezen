import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { CreditCard, Ellipsis, LogOut, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useLogout, useSession } from '../../lib/auth'
import { describePlan } from '../../lib/plan'
import { useShellStore } from '../../lib/stores'
import { Badge, FramezenMark, Sheet, SheetContent } from '../../ui'
import { MAIN_NAV, SETTINGS_NAV } from './nav'

/** Destinos fijos de la barra inferior; el resto va en «Más». */
const TAB_COUNT = 4
const PLAN_PATH = '/ajustes/plan'

/** Lo que no cabe en la barra inferior: Catálogo, Documentos y Ajustes. */
export const MORE_NAV = [...MAIN_NAV.slice(TAB_COUNT), SETTINGS_NAV]

function isUnder(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

/** En el teléfono: barra inferior con 4 destinos + «Más» (la única entrada al resto). */
export function MobileTabBar() {
  const open = useShellStore((s) => s.mobileNavOpen)
  const setOpen = useShellStore((s) => s.setMobileNavOpen)
  const { pathname } = useLocation()
  const moreActive = MORE_NAV.some((item) => isUnder(pathname, item.to))
  const tabs = MAIN_NAV.slice(0, TAB_COUNT)
  return (
    <nav
      aria-label="Navegación"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-paper-200 bg-paper-50 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                isActive ? 'text-ink-600' : 'text-paper-600',
              )
            }
          >
            <Icon aria-hidden strokeWidth={1.75} className="size-5" />
            {item.label}
          </NavLink>
        )
      })}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
          moreActive || open ? 'text-ink-600' : 'text-paper-600',
        )}
      >
        <Ellipsis aria-hidden strokeWidth={1.75} className="size-5" />
        Más
      </button>
    </nav>
  )
}

const rowClass = (active: boolean) =>
  cn(
    'flex h-11 w-full items-center gap-3 rounded-sm border px-3 text-left text-base transition-colors duration-120',
    active
      ? 'border-paper-200 bg-paper-50 font-medium text-paper-900'
      : 'border-transparent text-paper-900 hover:bg-paper-100 active:bg-paper-100',
  )

function SheetLink({ to, label, icon: Icon, active, trailing, onNavigate }: { to: string; label: string; icon: LucideIcon; active: boolean; trailing?: ReactNode; onNavigate: () => void }) {
  return (
    <Link to={to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={rowClass(active)}>
      <Icon aria-hidden strokeWidth={1.75} className={cn('size-5 shrink-0', active ? 'text-ink-600' : 'text-paper-600')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </Link>
  )
}

/** Hoja inferior de «Más»: solo lo que no está en la barra (Catálogo, Documentos, Ajustes, plan y salir). */
export function MobileNavSheet() {
  const me = useSession()
  const plan = describePlan(me.billing)
  const logout = useLogout()
  const open = useShellStore((s) => s.mobileNavOpen)
  const setOpen = useShellStore((s) => s.setMobileNavOpen)
  const { pathname } = useLocation()
  const close = () => setOpen(false)
  const onPlan = isUnder(pathname, PLAN_PATH)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        title={
          <span className="flex items-center gap-2">
            <FramezenMark size={20} />
            <span className="truncate">{me.org.name}</span>
          </span>
        }
      >
        <nav aria-label="Más secciones" className="-mx-2 -my-2 flex flex-col gap-0.5">
          {MORE_NAV.map((item) => (
            <SheetLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              active={isUnder(pathname, item.to) && !(item.to === SETTINGS_NAV.to && onPlan)}
              onNavigate={close}
            />
          ))}
          <SheetLink
            to={PLAN_PATH}
            label="Plan y facturación"
            icon={CreditCard}
            active={onPlan}
            onNavigate={close}
            trailing={
              <Badge tone={plan.isTrial ? 'ink' : 'neutral'} size="sm">
                {plan.name}
              </Badge>
            }
          />
          <div aria-hidden className="mx-3 my-1.5 h-px bg-paper-200" />
          <button
            type="button"
            onClick={() => {
              close()
              logout.mutate()
            }}
            className={rowClass(false)}
          >
            <LogOut aria-hidden strokeWidth={1.75} className="size-5 shrink-0 text-paper-600" />
            Cerrar sesión
          </button>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
