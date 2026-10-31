import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { api, humanError } from '../../lib/api'
import { Button, buttonClass, Field, Input } from '../../ui'
import { AuthLayout, FormError } from './AuthLayout'
import { emailError } from './validation'

export default function ForgotPasswordPage() {
  const [params] = useSearchParams()
  // Enlaces enviados con el formato anterior (/recuperar?token=…): van a «Contraseña nueva».
  const legacyToken = params.get('token')
  const [email, setEmail] = useState(params.get('correo') ?? '')
  const [error, setError] = useState<string>()
  const forgot = useMutation({ mutationFn: (value: string) => api.auth.forgot(value) })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const problem = emailError(email)
    setError(problem)
    if (problem) return
    forgot.mutate(email.trim())
  }

  const art = {
    kind: 'transom' as const,
    width: 1000,
    height: 1600,
    label: 'Abatir con sobreluz',
    phrase: 'Nada se pierde.',
    caption: 'Todo lo que cotizaste sigue guardado. Solo falta abrir la puerta de nuevo.',
  }

  if (legacyToken) return <Navigate to={`/restablecer/${encodeURIComponent(legacyToken)}`} replace />

  if (forgot.isSuccess) {
    return (
      <AuthLayout pageTitle="Revisa tu correo" title="Revisa tu correo" art={art}>
        <div className="flex flex-col gap-5">
          <span className="inline-flex size-10 items-center justify-center rounded-md bg-ok-50 text-ok-600">
            <MailCheck aria-hidden strokeWidth={1.75} className="size-5" />
          </span>
          <p className="text-paper-900">
            Si <span className="font-medium">{email.trim()}</span> tiene una cuenta en Framezen, en un par de minutos te
            llegará un enlace para elegir una contraseña nueva.
          </p>
          <p className="text-[13px] text-paper-600">
            ¿No llega? Revisa la carpeta de spam o{' '}
            <button type="button" onClick={() => forgot.reset()} className="font-medium text-ink-600 hover:text-ink-700">
              prueba con otro correo
            </button>
            .
          </p>
          <Link to="/entrar" className={buttonClass('secondary', 'lg', 'w-full')}>
            Volver a entrar
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      pageTitle="Recuperar acceso"
      title="Recupera tu acceso"
      subtitle="Te mandamos un enlace para elegir una contraseña nueva."
      art={art}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormError>{forgot.error ? humanError(forgot.error) : null}</FormError>
        <Field label="Correo de tu cuenta" error={error}>
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
        <Button type="submit" variant="primary" size="lg" loading={forgot.isPending} className="w-full">
          Enviar enlace
        </Button>
        <Link
          to="/entrar"
          className="inline-flex items-center justify-center gap-1.5 text-[13px] font-medium text-paper-600 hover:text-paper-900"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Volver a entrar
        </Link>
      </form>
    </AuthLayout>
  )
}
