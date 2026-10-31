import { Link } from 'react-router'
import { useSession } from '../../lib/auth'
import { describePlan } from '../../lib/plan'

/**
 * Aviso de cuenta, nunca un muro: prueba vencida (solo lectura con exportación) o pago atrasado.
 */
export function AccountBanner() {
  const me = useSession()
  const plan = describePlan(me.billing)
  if (!plan.readOnly && !plan.pastDue) return null
  // El servidor envía el mensaje exacto (prueba, plan terminado o pago atrasado); si no, uno genérico.
  const readOnlyText =
    plan.readOnlyMessage ??
    (plan.isTrial
      ? 'Tu prueba terminó. Puedes ver y exportar todo; para seguir cotizando, elige un plan.'
      : 'Tu plan terminó. Puedes ver y exportar todo; para seguir cotizando, reactívalo.')
  const text = plan.readOnly
    ? readOnlyText
    : 'No pudimos cobrar tu plan. Todo sigue funcionando; revisa tu medio de pago cuando puedas.'
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warn-600/20 bg-warn-50 px-4 py-2 text-center text-[13px] text-warn-800"
    >
      <span>{text}</span>
      <Link to="/ajustes/plan" className="font-semibold underline decoration-warn-600/40 underline-offset-2 hover:decoration-warn-600">
        {plan.readOnly ? (plan.readOnlyReason === 'payment_overdue' ? 'Revisar pago' : 'Ver planes') : 'Revisar pago'}
      </Link>
    </div>
  )
}
