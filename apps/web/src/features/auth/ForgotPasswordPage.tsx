import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { api, humanError } from '../../lib/api'
import { useT } from '../../lib/i18n'
import { Button, buttonClass, Field, Input } from '../../ui'
import { AuthLayout, FormError, type AuthArtSpec } from './AuthLayout'
import es from './i18n/es'
import { emailError } from './validation'

export default function ForgotPasswordPage() {
  const t = useT(es)
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

  const art = useMemo<AuthArtSpec>(
    () => ({ typology: 'casement_transom', width: 1000, height: 1600, colorId: 'blanco' }),
    [],
  )

  if (legacyToken) return <Navigate to={`/restablecer/${encodeURIComponent(legacyToken)}`} replace />

  if (forgot.isSuccess) {
    return (
      <AuthLayout pageTitle={t('forgot.sentTitle')} title={t('forgot.sentTitle')} art={art}>
        <div className="flex flex-col gap-5">
          <p className="text-fg">{t.rich('forgot.sentText', { b: <span className="font-medium text-fg-strong" />, email: email.trim() })}</p>
          <p className="text-table text-fg-muted">
            {t.rich('forgot.notArriving', {
              retry: <button type="button" onClick={() => forgot.reset()} className="font-medium text-fg-strong underline decoration-divider-strong underline-offset-4 hover:decoration-fg-muted" />,
            })}
          </p>
          <Link to="/entrar" className={buttonClass('secondary', 'lg', 'w-full')}>
            {t('forgot.back')}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout pageTitle={t('forgot.pageTitle')} title={t('forgot.title')} subtitle={t('forgot.subtitle')} art={art}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormError>{forgot.error ? humanError(forgot.error) : null}</FormError>
        <Field label={t('forgot.email')} error={error}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('fields.emailPlaceholder')}
           
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={forgot.isPending} className="w-full">
          {t('forgot.submit')}
        </Button>
        <Link to="/entrar" className="inline-flex items-center justify-center gap-1.5 text-table font-medium text-fg-muted hover:text-fg-strong">
          <ArrowLeft aria-hidden className="size-3.5" />
          {t('forgot.back')}
        </Link>
      </form>
    </AuthLayout>
  )
}
