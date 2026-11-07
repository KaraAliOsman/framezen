import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiRequestError, humanError } from '../../lib/api'
import { safeNext, useLogin } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { Button, Field, Input } from '../../ui'
import { AuthLayout, FormError, type AuthArtSpec } from './AuthLayout'
import es from './i18n/es'
import { PasswordInput } from './PasswordInput'
import { emailError } from './validation'

export default function LoginPage() {
  const t = useT(es)
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
    const next = { email: emailError(email), password: password ? undefined : t('validation.loginPasswordRequired') }
    setErrors(next)
    if (next.email || next.password) return
    login.mutate({ email: email.trim(), password }, { onSuccess: () => navigate(safeNext(params.get('next')), { replace: true }) })
  }

  const art = useMemo<AuthArtSpec>(
    () => ({ typology: 'tilt_turn', width: 1200, height: 1400, colorId: 'antracita' }),
    [],
  )

  return (
    <AuthLayout
      pageTitle={t('login.pageTitle')}
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      aside={
        <>
          {t('login.noAccount')}{' '}
          <Link to="/crear-cuenta" className="font-medium text-fg-strong underline decoration-divider-strong underline-offset-4 hover:decoration-fg-muted">
            {t('login.createAccount')}
          </Link>
        </>
      }
      art={art}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormError>{serverError && !fieldError ? humanError(serverError) : null}</FormError>
        <Field label={t('fields.email')} error={errors.email ?? (fieldError === 'email' ? humanError(serverError) : undefined)}>
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
        <Field
          label={t('fields.password')}
          error={errors.password ?? (fieldError === 'password' ? humanError(serverError) : undefined)}
          aside={
            <Link
              to={`/recuperar${email ? `?correo=${encodeURIComponent(email.trim())}` : ''}`}
              className="font-medium text-fg-strong underline decoration-divider-strong underline-offset-4 hover:decoration-fg-muted"
            >
              {t('login.forgot')}
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={login.isPending} className="mt-1 w-full">
          {t('login.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
