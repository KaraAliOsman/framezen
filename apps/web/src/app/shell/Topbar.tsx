import { Link } from 'react-router'
import { Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useSession } from '../../lib/auth'
import { describePlan } from '../../lib/plan'
import { useShellStore } from '../../lib/stores'
import { FramezenMark, Kbd } from '../../ui'
import { AccountMenu } from './AccountMenu'
import { AssistantSlot } from './AssistantSlot'

function TrialChip() {
  const me = useSession()
  const plan = describePlan(me.billing)
  if (!plan.isTrial || plan.trialDaysLeft === null || plan.trialDaysLeft === 0) return null
  const urgent = plan.trialDaysLeft <= 3
  return (
    <Link
      to="/ajustes/plan"
      className={cn(
        'hidden h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium transition-colors duration-120 sm:inline-flex',
        urgent
          ? 'border-warn-600/30 bg-warn-50 text-warn-800 hover:border-warn-600/50'
          : 'border-paper-200 bg-paper-0 text-paper-600 hover:text-paper-900',
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', urgent ? 'bg-warn-600' : 'bg-ink-600')} />
      Prueba · {plan.trialDaysLeft === 1 ? 'queda 1 día' : `quedan ${plan.trialDaysLeft} días`}
    </Link>
  )
}

/** Barra superior: búsqueda/⌘K, prueba restante, Marco y cuenta. */
export function Topbar({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const setCommandOpen = useShellStore((s) => s.setCommandOpen)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-paper-200 bg-paper-50 px-2 sm:px-3 md:gap-3 md:px-4">
      {/* En el teléfono la navegación vive en la barra inferior (con «Más»): aquí solo la marca. */}
      <Link to="/inicio" aria-label="Inicio" className="rounded-sm p-1 text-paper-900 md:hidden">
        <FramezenMark size={22} />
      </Link>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="group flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm border border-paper-200 bg-paper-0 px-2.5 text-left text-paper-600 transition-colors duration-120 hover:border-paper-350/60 hover:text-paper-900 md:max-w-md touch:h-10"
      >
        <Search aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-base">Buscar o ir a…</span>
        <span className="hidden sm:inline-flex">
          <Kbd combo="mod+k" />
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <TrialChip />
        <AssistantSlot />
        <AccountMenu onShowShortcuts={onShowShortcuts} />
      </div>
    </header>
  )
}
