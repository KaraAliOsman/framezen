import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiRequestError, humanError } from '../../lib/api'
import { useResetPassword } from '../../lib/auth'
import { useT } from '../../lib/i18n'
import { Button, buttonClass, Field, toast } from '../../ui'
import { AuthLayout, FormError, type AuthArtSpec } from './AuthLayout'
import es from './i18n/es'
import { PasswordInput } from './PasswordInput'
import { MIN_PASSWORD, passwordError } from './validation'

export default function ResetPasswordPage() {
  const t = useT(es)
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
            toast.success(t('reset.doneSignedIn'))
            navigate('/inicio', { replace: true })
          } else {
            toast.success(t('reset.doneSignIn'))
            navigate('/entrar', { replace: true })
          }
        },
      },
    )
  }

  const art = useMemo<AuthArtSpec>(
    () => ({ typology: 'tilt_turn', width: 800, height: 1200, colorId: 'nogal' }),
    [],
  )

  return (
    <AuthLayout pageTitle={t('reset.pageTitle')} title={t('reset.title')} subtitle={t('reset.subtitle')} art={art}>
      {expired ? (
        <div className="flex flex-col gap-5">
          <FormError>{humanError(reset.error)}</FormError>
          <Link to="/recuperar" className={buttonClass('primary', 'lg', 'w-full')}>
            {t('reset.requestAgain')}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <FormError>{reset.error ? humanError(reset.error) : null}</FormError>
          <Field label={t('reset.password')} hint={t('fields.passwordHint', { min: MIN_PASSWORD })} error={error}>
            <PasswordInput autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={reset.isPending} className="w-full">
            {t('reset.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
