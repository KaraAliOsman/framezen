/**
 * Pie de la barra lateral. No hay medidores: el consumo vive en Ajustes › Plan. Un contador a la
 * vista hace que la gente se cuide de usar el producto, así que aquí solo aparece lo que pide una
 * decisión: la cuenta quedó en solo lectura o la IA del mes se está acabando. Los días de prueba
 * avisan en la barra superior, en los últimos 3 días.
 */
import { Link } from 'react-router'
import { Gauge } from 'lucide-react'
import { useSession } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { describePlan, type PlanInfo } from '../../lib/plan'
import { Tooltip } from '../../ui'
import es from '../i18n/es'

const PLAN_PATH = '/ajustes/plan'
/** Bajo esta fracción de IA disponible vale la pena avisar. */
const LOW_AI_RATIO = 0.1

export type UsageNudge = 'readOnly' | 'aiOut' | 'aiLow'

/** Qué aviso corresponde, o ninguno (puro, para probar sin React). */
export function usageNudge(plan: PlanInfo): UsageNudge | null {
  if (plan.readOnly) return 'readOnly'
  if (!plan.has('assistant') || plan.credits.included <= 0) return null
  if (plan.credits.left <= 0) return 'aiOut'
  return plan.credits.left / plan.credits.included <= LOW_AI_RATIO ? 'aiLow' : null
}

export function PlanUsage({ collapsed = false }: { collapsed?: boolean }) {
  const t = useT(es)
  const me = useSession()
  const nudge = usageNudge(describePlan(me.billing))
  if (!nudge) return null
  const text = t(`usage.${nudge}`)

  if (collapsed) {
    return (
      <Tooltip content={text} side="right">
        <Link
          to={PLAN_PATH}
          aria-label={text}
          className="inline-flex size-9 items-center justify-center rounded-sm text-fg-muted transition-colors duration-100 hover:bg-frame-hover hover:text-fg-strong"
        >
          <Gauge aria-hidden strokeWidth={1.75} className="size-4" />
        </Link>
      </Tooltip>
    )
  }

  return (
    <Link
      to={PLAN_PATH}
      className="group mb-1 flex items-center justify-between gap-2 rounded-sm px-2 py-2 text-table transition-colors duration-100 hover:bg-frame-hover"
    >
      <span className="min-w-0 truncate text-fg">{text}</span>
      <span className="shrink-0 text-meta text-fg-muted transition-colors duration-100 group-hover:text-fg-strong">{t('usage.seePlan')}</span>
    </Link>
  )
}
