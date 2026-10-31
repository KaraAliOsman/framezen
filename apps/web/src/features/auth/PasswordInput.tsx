import { useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '../../ui'

/** Contraseña con botón para mostrarla (mejor que pedirla dos veces). */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, 'type' | 'suffix'>) {
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
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          className="-mr-1 inline-flex size-7 items-center justify-center rounded-sm text-paper-600 hover:bg-paper-100 hover:text-paper-900"
        >
          <Icon aria-hidden strokeWidth={1.75} className="size-4" />
        </button>
      }
    />
  )
}
