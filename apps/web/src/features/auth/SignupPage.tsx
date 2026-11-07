import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { TRIAL_DAYS } from '@dekopen/shared'
import { ApiRequestError, humanError } from '../../lib/api'
import { useSignup } from '../../lib/auth'
import { firstName } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { Button, Field, Input, toast } from '../../ui'
import { AuthLayout, FormError, type AuthArtSpec } from './AuthLayout'
import es from './i18n/es'
import { PasswordInput } from './PasswordInput'
import { emailError, MIN_PASSWORD, passwordError } from './validation'

type Fields = 'name' | 'company' | 'email' | 'password'

export default function SignupPage() {
  const t = useT(es)
  const navigate = useNavigate()
  const signup = useSignup()
  const [values, setValues] = useState<Record<Fields, string>>({ name: '', company: '', email: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({})

  const set = (field: Fields) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: event.target.value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const serverError = signup.error
  const serverField = serverError instanceof ApiRequestError ? (serverError.field as Fields | undefined) : undefined
  const errorFor = (field: Fields) => errors[field] ?? (serverField === field ? humanError(serverError) : undefined)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next: Partial<Record<Fields, string>> = {
      name: values.name.trim() ? undefined : t('validation.nameRequired'),
      company: values.company.trim() ? undefined : t('validation.companyRequired'),
      email: emailError(values.email),
      password: passwordError(values.password),
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    signup.mutate(
      {
        name: values.name.trim(),
        company: values.company.trim(),
        email: values.email.trim(),
        password: values.password,
      },
      {
        onSuccess: (me) => {
          toast.success(t('signup.welcome', { name: firstName(me.user.name), days: TRIAL_DAYS }))
          navigate('/inicio', { replace: true })
        },
      },
    )
  }

  const art = useMemo<AuthArtSpec>(
    () => ({ typology: 'sliding_2', width: 1800, height: 1300, colorId: 'roble-dorado' }),
    [],
  )

  return (
    <AuthLayout
      pageTitle={t('signup.pageTitle')}
      title={t('signup.title')}
      subtitle={t('signup.subtitle', { days: TRIAL_DAYS })}
      aside={
        <>
          {t('signup.haveAccount')}{' '}
          <Link to="/entrar" className="font-medium text-fg-strong underline decoration-divider-strong underline-offset-4 hover:decoration-fg-muted">
            {t('signup.login')}
          </Link>
        </>
      }
      art={art}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError>{serverError && !serverField ? humanError(serverError) : null}</FormError>
        <>
          <Field label={t('fields.name')} error={errorFor('name')}>
            <Input autoComplete="name" autoFocus value={values.name} onChange={set('name')} placeholder={t('fields.namePlaceholder')} />
          </Field>
          <Field label={t('fields.company')} error={errorFor('company')}>
            <Input autoComplete="organization" value={values.company} onChange={set('company')} placeholder={t('fields.companyPlaceholder')} />
          </Field>
        </>
        <Field label={t('fields.email')} error={errorFor('email')}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={values.email}
            onChange={set('email')}
            placeholder={t('fields.emailPlaceholder')}
           
          />
        </Field>
        <Field label={t('fields.password')} hint={t('fields.passwordHint', { min: MIN_PASSWORD })} error={errorFor('password')}>
          <PasswordInput autoComplete="new-password" value={values.password} onChange={set('password')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={signup.isPending} className="mt-2 w-full">
          {t('signup.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
