import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent'

export interface NoticeProps {
  tone?: NoticeTone
  title?: ReactNode
  children?: ReactNode
  /** Acción a la derecha (botón pequeño o enlace: «Revisar precio», «Reintentar»). */
  action?: ReactNode
  /** Icono propio; por defecto, el del tono. `null` para ninguno. */
  icon?: LucideIcon | null
  /** compact = una línea dentro de inspectores y tablas. */
  size?: 'compact' | 'default'
  className?: string
}

const tones: Record<NoticeTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: 'bg-info-bg', icon: 'text-info', Icon: Info },
  success: { box: 'bg-success-bg', icon: 'text-success', Icon: CircleCheck },
  warning: { box: 'bg-warning-bg', icon: 'text-warning', Icon: TriangleAlert },
  danger: { box: 'bg-danger-bg', icon: 'text-danger', Icon: CircleAlert },
  neutral: { box: 'bg-sunken', icon: 'text-fg-muted', Icon: Info },
  accent: { box: 'bg-sunken', icon: 'text-fg-strong', Icon: Info },
}

/**
 * Aviso en línea (principio del producto: avisos en el sitio, nunca bloqueos). Dice qué pasa y cómo
 * seguir; el color acompaña a un icono y a un texto, nunca va solo.
 */
export function Notice({ tone = 'info', title, children, action, icon, size = 'default', className }: NoticeProps) {
  const t = tones[tone]
  const Icon = icon === null ? null : (icon ?? t.Icon)
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status'
  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-2.5 rounded-sm text-fg',
        size === 'compact' ? 'px-2.5 py-2 text-table' : 'px-3.5 py-3 text-base',
        t.box,
        className,
      )}
    >
      {Icon ? <Icon aria-hidden strokeWidth={2} className={cn('mt-0.5 shrink-0', size === 'compact' ? 'size-3.5' : 'size-4', t.icon)} /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium text-fg-strong">{title}</p> : null}
        {children ? <div className={cn(title ? 'mt-0.5 text-fg-muted' : 'text-fg', size === 'compact' ? '' : 'text-table')}>{children}</div> : null}
      </div>
      {action ? <div className="-my-0.5 shrink-0 self-center">{action}</div> : null}
    </div>
  )
}
