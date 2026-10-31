import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiRequestError, humanError } from '../../lib/api'
import { safeNext, useLogin } from '../../lib/auth'
import { Button, Field, Input } from '../../ui'
import { AuthLayout, FormError } from './AuthLayout'
import { PasswordInput } from './PasswordInput'
import { emailError } from './validation'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const login = useLogin()
  const [email, setEmail] = useState(params.get('correo') ?? '')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const serverError = login.error
  const fieldError = serverError instanceof ApiRequestError ? serverError.field : undefined

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next = { email: emailError(email), password: password ? undefined : 'Escribe tu contraseña.' }
    setErrors(next)
    if (next.email || next.password) return
    login.mutate(
      { email: email.trim(), password },
      { onSuccess: () => navigate(safeNext(params.get('next')), { replace: true }) },
    )
  }

  return (
    <AuthLayout
      pageTitle="Entrar"
      title="Entra a tu taller"
      subtitle="Tus cotizaciones, clientes y órdenes de trabajo, tal como los dejaste."
      aside={
        <>
          ¿Aún no tienes cuenta?{' '}
          <Link to="/crear-cuenta" className="font-medium text-ink-600 hover:text-ink-700">
            Crear cuenta
          </Link>
        </>
      }
      art={{
        kind: 'casement',
        width: 1200,
        height: 1500,
        label: 'Abatir 1 hoja',
        phrase: 'Mide una vez. Cotiza en segundos.',
        caption: 'Elige la ventana, escribe ancho × alto y el precio aparece solo.',
      }}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormError>{serverError && !fieldError ? humanError(serverError) : null}</FormError>
        <Field label="Correo" error={errors.email ?? (fieldError === 'email' ? humanError(serverError) : undefined)}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@taller.cl"
            size="lg"
          />
        </Field>
        <Field
          label="Contraseña"
          error={errors.password ?? (fieldError === 'password' ? humanError(serverError) : undefined)}
          aside={
            <Link
              to={`/recuperar${email ? `?correo=${encodeURIComponent(email.trim())}` : ''}`}
              className="font-medium text-ink-600 hover:text-ink-700"
            >
              ¿La olvidaste?
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} size="lg" />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={login.isPending} className="mt-1 w-full">
          Entrar
        </Button>
      </form>
    </AuthLayout>
  )
}
