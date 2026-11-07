import { Link } from 'react-router'
import { Search } from 'lucide-react'
import { useSession } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { describePlan } from '../../lib/plan'
import { useShellStore } from '../../lib/stores'
import { DekopenMark, IconButton } from '../../ui'
import es from '../i18n/es'
import { AccountMenu } from './AccountMenu'
import { AssistantSlot } from './AssistantSlot'
import { TopbarSlot } from './TopbarSlot'

/** La prueba solo sube a la barra cuando se está acabando; el resto del tiempo vive en la barra lateral. */
function TrialChip() {
  const t = useT(es)
  const me = useSession()
  const plan = describePlan(me.billing)
  if (!plan.isTrial || plan.trialDaysLeft === null || plan.trialDaysLeft === 0 || plan.trialDaysLeft > 3) return null
  return (
    <Link
      to="/ajustes/plan"
      className="hidden h-7 items-center rounded-sm px-2 text-table font-medium text-warning transition-colors duration-100 hover:bg-warning-bg sm:inline-flex"
    >
      {t('shell.trialChip', { count: plan.trialDaysLeft })}
    </Link>
  )
}

/**
 * Barra superior (48 px): prueba restante, asistente y cuenta. Las migas viven en la cabecera de cada
 * página; solo el editor ocupa la zona izquierda (ver TopbarSlot). En el teléfono: marca y búsqueda.
 */
export function Topbar({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const t = useT(es)
  const setCommandOpen = useShellStore((s) => s.setCommandOpen)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-2 sm:px-3 md:gap-3 md:px-3">
      {/* En el teléfono la navegación vive en la barra inferior (con «Más»): aquí la marca y la búsqueda. */}
      <Link to="/inicio" aria-label={t('shell.home')} className="rounded-sm p-1 text-fg-strong md:hidden">
        <DekopenMark size={22} />
      </Link>
      <TopbarSlot className="flex min-w-0 flex-1 items-center gap-2" />

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <IconButton icon={Search} label={t('shell.search')} onClick={() => setCommandOpen(true)} className="md:hidden" />
        <TrialChip />
        <AssistantSlot />
        <AccountMenu onShowShortcuts={onShowShortcuts} />
      </div>
    </header>
  )
}
