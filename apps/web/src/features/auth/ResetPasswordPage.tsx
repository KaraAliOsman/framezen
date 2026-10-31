import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiRequestError, humanError } from '../../lib/api'
import { useResetPassword } from '../../lib/auth'
import { Button, buttonClass, Field, toast } from '../../ui'
import { AuthLayout, FormError } from './AuthLayout'
import { PasswordInput } from './PasswordInput'
import { MIN_PASSWORD, passwordError } from './validation'

export default function ResetPasswordPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const reset = useResetPassword()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()

  const expired =
    reset.error instanceof ApiRequestError &&
    (reset.error.code === 'invalid_token' || reset.error.field === 'token' || reset.error.status === 410)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const problem = passwordError(password)
    setError(problem)
    if (problem) return
    reset.mutate(
      { token, password },
      {
        onSuccess: (me) => {
          if (me) {
            toast.success('Listo. Tu contraseña quedó actualizada.')
            navigate('/inicio', { replace: true })
          } else {
            toast.success('Listo. Entra con tu contraseña nueva.')
            navigate('/entrar', { replace: true })
          }
        },
      },
    )
  }

  return (
    <AuthLayout
      pageTitle="Contraseña nueva"
      title="Elige una contraseña nueva"
      subtitle="Al guardarla entras directo, donde ibas."
      art={{
        kind: 'tilt_turn',
        width: 800,
        height: 1200,
        label: 'Oscilobatiente',
        phrase: 'Una llave nueva, la misma casa.',
        caption: 'Tus cotizaciones, clientes y OT siguen exactamente donde los dejaste.',
      }}
    >
      {expired ? (
        <div className="flex flex-col gap-5">
          <FormError>{humanError(reset.error)}</FormError>
          <Link to="/recuperar" className={buttonClass('primary', 'lg', 'w-full')}>
            Pedir otro enlace
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <FormError>{reset.error ? humanError(reset.error) : null}</FormError>
          <Field label="Contraseña nueva" hint={`Al menos ${MIN_PASSWORD} caracteres.`} error={error}>
            <PasswordInput autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} size="lg" />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={reset.isPending} className="w-full">
            Guardar y entrar
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
