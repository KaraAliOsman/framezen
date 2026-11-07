import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { CreditCard, Ellipsis, LogOut, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useLogout, useSession } from '../../lib/auth'
import { useGlossary, useT } from '../../lib/i18n'
import { describePlan } from '../../lib/plan'
import { useShellStore } from '../../lib/stores'
import { Badge, Sheet, SheetContent } from '../../ui'
import es from '../i18n/es'
import { MAIN_NAV, SETTINGS_NAV } from './nav'
import { OrgTile } from './Sidebar'

/** Destinos fijos de la barra inferior; el resto va en «Más». */
const TAB_COUNT = 4
const PLAN_PATH = '/ajustes/plan'

/** Lo que no cabe en la barra inferior: Catálogo, Documentos y Ajustes. */
export const MORE_NAV = [...MAIN_NAV.slice(TAB_COUNT), SETTINGS_NAV]

function isUnder(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

const tabClass = (active: boolean) =>
  cn(
    'flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-micro font-medium transition-colors duration-100',
    active ? 'text-fg-strong' : 'text-fg-muted active:text-fg-strong',
  )

/** En el teléfono: barra inferior con 4 destinos + «Más» (la única entrada al resto). */
export function MobileTabBar() {
  const t = useT(es)
  const open = useShellStore((s) => s.mobileNavOpen)
  const setOpen = useShellStore((s) => s.setMobileNavOpen)
  const { pathname } = useLocation()
  const moreActive = MORE_NAV.some((item) => isUnder(pathname, item.to))
  const tabs = MAIN_NAV.slice(0, TAB_COUNT)
  return (
    <nav
      data-frame
      aria-label={t('shell.mobileNav')}
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-divider bg-tabbar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((item) => {
        const Icon = item.icon
        return (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => tabClass(isActive)}>
            <Icon aria-hidden strokeWidth={1.75} className="size-5" />
            <span className="max-w-full truncate">{t(`nav.${item.id}`)}</span>
          </NavLink>
        )
      })}
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className={tabClass(moreActive || open)}>
        <Ellipsis aria-hidden strokeWidth={1.75} className="size-5" />
        <span className="max-w-full truncate">{t('shell.more')}</span>
      </button>
    </nav>
  )
}

const rowClass = (active: boolean) =>
  cn(
    'relative flex h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-base transition-colors duration-100',
    active ? 'bg-hover font-medium text-fg-strong' : 'text-fg hover:bg-hover active:bg-hover',
  )

function SheetLink({
  to,
  label,
  icon: Icon,
  active,
  trailing,
  onNavigate,
}: {
  to: string
  label: string
  icon: LucideIcon
  active: boolean
  trailing?: ReactNode
  onNavigate: () => void
}) {
  return (
    <Link to={to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={rowClass(active)}>
      <Icon aria-hidden strokeWidth={1.75} className={cn('size-5 shrink-0', active ? 'text-fg-strong' : 'text-fg-muted')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </Link>
  )
}

/** Hoja inferior de «Más»: solo lo que no está en la barra (Catálogo, Documentos, Ajustes, plan y salir). */
export function MobileNavSheet() {
  const t = useT(es)
  const g = useGlossary()
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
            <OrgTile name={me.org.name} logo={me.org.logo} />
            <span className="truncate">{me.org.name}</span>
          </span>
        }
      >
        <nav aria-label={t('shell.moreSections')} className="-mx-2 -my-2 flex flex-col gap-0.5">
          {MORE_NAV.map((item) => (
            <SheetLink
              key={item.to}
              to={item.to}
              label={t(`nav.${item.id}`)}
              icon={item.icon}
              active={isUnder(pathname, item.to) && !(item.to === SETTINGS_NAV.to && onPlan)}
              onNavigate={close}
            />
          ))}
          <SheetLink
            to={PLAN_PATH}
            label={t('shell.planBilling')}
            icon={CreditCard}
            active={onPlan}
            onNavigate={close}
            trailing={
              <Badge tone={plan.isTrial ? 'accent' : 'neutral'} size="sm">
                {g.plan(plan.code)}
              </Badge>
            }
          />
          <div aria-hidden className="mx-3 my-1.5 h-px bg-divider" />
          <button
            type="button"
            onClick={() => {
              close()
              logout.mutate()
            }}
            className={rowClass(false)}
          >
            <LogOut aria-hidden strokeWidth={1.75} className="size-5 shrink-0 text-fg-muted" />
            {t('shell.logout')}
          </button>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
