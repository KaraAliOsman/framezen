import { useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useT } from '../../lib/i18n'
import { Input } from '../../ui'
import es from './i18n/es'

/** Contraseña con botón para mostrarla (mejor que pedirla dos veces). */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, 'type' | 'suffix'>) {
  const t = useT(es)
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      suffix={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('fields.hidePassword') : t('fields.showPassword')}
          aria-pressed={visible}
          className="-mr-1 inline-flex size-8 items-center justify-center rounded-sm text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg-strong"
        >
          <Icon aria-hidden strokeWidth={1.75} className="size-4" />
        </button>
      }
    />
  )
}
