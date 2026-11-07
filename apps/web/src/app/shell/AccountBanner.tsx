import { Link } from 'react-router'
import { useSession } from '../../lib/auth'
import { useLocale, useT } from '../../lib/i18n'
import { describePlan } from '../../lib/plan'
import { buttonClass, Notice } from '../../ui'
import es from '../i18n/es'

/**
 * Aviso de cuenta bajo la barra superior, nunca un muro: prueba vencida o plan terminado (solo
 * lectura con exportación, aviso) o pago atrasado (todo funciona, peligro suave).
 */
export function AccountBanner() {
  const t = useT(es)
  const { locale } = useLocale()
  const me = useSession()
  const plan = describePlan(me.billing)
  if (!plan.readOnly && !plan.pastDue) return null
  // El servidor envía el mensaje exacto (prueba, plan terminado o pago atrasado) en español; en otro
  // idioma se usa el nuestro para no mezclar idiomas en la misma línea.
  const serverText = locale === 'es' ? plan.readOnlyMessage : undefined
  const readOnlyText = serverText ?? (plan.isTrial ? t('banner.trialEnded') : t('banner.planEnded'))
  const text = plan.readOnly ? readOnlyText : t('banner.pastDue')
  const action = plan.readOnly ? (plan.readOnlyReason === 'payment_overdue' ? t('banner.reviewPayment') : t('banner.seePlans')) : t('banner.reviewPayment')
  return (
    <Notice
      tone={plan.readOnly ? 'warning' : 'danger'}
      size="compact"
      className="shrink-0 rounded-none border-x-0 border-t-0 px-4 sm:px-5"
      action={
        <Link to="/ajustes/plan" className={buttonClass('secondary', 'xs')}>
          {action}
        </Link>
      }
    >
      {text}
    </Notice>
  )
}
