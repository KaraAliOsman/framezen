import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Check } from 'lucide-react'
import { TRIAL_DAYS } from '@framezen/shared'
import { ApiRequestError, humanError } from '../../lib/api'
import { useSignup } from '../../lib/auth'
import { firstName } from '../../lib/format'
import { Button, Field, Input, toast } from '../../ui'
import { AuthLayout, FormError } from './AuthLayout'
import { PasswordInput } from './PasswordInput'
import { emailError, MIN_PASSWORD, passwordError } from './validation'

type Fields = 'name' | 'company' | 'email' | 'password'

export default function SignupPage() {
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
      name: values.name.trim() ? undefined : 'Escribe tu nombre.',
      company: values.company.trim() ? undefined : 'Escribe el nombre de tu taller o empresa.',
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
          toast.success(`Listo, ${firstName(me.user.name)}. Tienes ${TRIAL_DAYS} días con todo Pro.`)
          navigate('/inicio', { replace: true })
        },
      },
    )
  }

  return (
    <AuthLayout
      pageTitle="Crear cuenta"
      title="Crea tu cuenta"
      subtitle={`${TRIAL_DAYS} días con todo Pro. Sin tarjeta, sin compromiso.`}
      aside={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/entrar" className="font-medium text-ink-600 hover:text-ink-700">
            Entrar
          </Link>
        </>
      }
      art={{
        kind: 'sliding',
        width: 1800,
        height: 1300,
        label: 'Corredera 2 hojas',
        phrase: 'Tu primera cotización, en menos de tres minutos.',
        caption: 'Con tus marcas, tus precios y un documento que vende. Nada te bloquea.',
      }}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError>{serverError && !serverField ? humanError(serverError) : null}</FormError>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tu nombre" error={errorFor('name')}>
            <Input autoComplete="name" autoFocus value={values.name} onChange={set('name')} placeholder="Ana Pérez" size="lg" />
          </Field>
          <Field label="Taller o empresa" error={errorFor('company')}>
            <Input
              autoComplete="organization"
              value={values.company}
              onChange={set('company')}
              placeholder="Ventanas del Sur"
              size="lg"
            />
          </Field>
        </div>
        <Field label="Correo" error={errorFor('email')}>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={values.email}
            onChange={set('email')}
            placeholder="tu@taller.cl"
            size="lg"
          />
        </Field>
        <Field label="Contraseña" hint={`Al menos ${MIN_PASSWORD} caracteres.`} error={errorFor('password')}>
          <PasswordInput autoComplete="new-password" value={values.password} onChange={set('password')} size="lg" />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={signup.isPending} className="mt-2 w-full">
          Crear cuenta y empezar
        </Button>
        <ul className="mt-1 flex flex-col gap-1.5 text-[13px] text-paper-600">
          {['Cotizaciones ilimitadas con todas las marcas', 'Puedes saltarte la configuración y cotizar de inmediato', 'Si no te convence, no pagas nada'].map(
            (line) => (
              <li key={line} className="flex items-center gap-2">
                <Check aria-hidden strokeWidth={2} className="size-3.5 shrink-0 text-ok-600" />
                {line}
              </li>
            ),
          )}
        </ul>
      </form>
    </AuthLayout>
  )
}
