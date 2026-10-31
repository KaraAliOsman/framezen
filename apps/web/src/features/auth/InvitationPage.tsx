import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ROLE_COPY } from '@framezen/shared'
import { humanError } from '../../lib/api'
import { useAcceptInvitation } from '../../lib/auth'
import { firstName } from '../../lib/format'
import { useInvitation } from '../../lib/hooks'
import { Button, buttonClass, Field, Input, Skeleton, toast } from '../../ui'
import { AuthLayout, FormError } from './AuthLayout'
import { PasswordInput } from './PasswordInput'
import { emailError, MIN_PASSWORD, passwordError } from './validation'

export default function InvitationPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const invitation = useInvitation(token)
  const accept = useAcceptInvitation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({})

  const info = invitation.data
  const art = {
    kind: 'double' as const,
    width: 1400,
    height: 1300,
    label: 'Abatir 2 hojas',
    phrase: 'Oficina y taller, en la misma página.',
    caption: info
      ? `${info.invitedBy ?? 'Tu equipo'} te sumó a ${info.orgName}. Cotizaciones, OT y catálogo, compartidos.`
      : 'Cotizaciones, órdenes de trabajo y catálogo, compartidos con tu equipo.',
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const finalEmail = (info?.email ?? email).trim()
    const next = {
      name: name.trim() ? undefined : 'Escribe tu nombre.',
      email: info?.email ? undefined : emailError(email),
      password: passwordError(password),
    }
    setErrors(next)
    if (next.name || next.email || next.password) return
    accept.mutate(
      { token, name: name.trim(), email: finalEmail, password },
      {
        onSuccess: (me) => {
          toast.success(`Ya eres parte del equipo, ${firstName(me.user.name)}.`)
          navigate('/inicio', { replace: true })
        },
      },
    )
  }

  if (invitation.isPending) {
    return (
      <AuthLayout pageTitle="Invitación" title="Abriendo tu invitación…" art={art}>
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </AuthLayout>
    )
  }

  if (invitation.isError || !info) {
    return (
      <AuthLayout
        pageTitle="Invitación"
        title="Esta invitación ya no sirve"
        subtitle="Puede que ya la hayas usado o que haya vencido. Pídele a quien te invitó que te mande otra."
        art={art}
      >
        <div className="flex flex-col gap-3">
          {invitation.error ? <FormError>{humanError(invitation.error)}</FormError> : null}
          <Link to="/entrar" className={buttonClass('primary', 'lg', 'w-full')}>
            Entrar con mi cuenta
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      pageTitle={`Súmate a ${info.orgName}`}
      title={`Súmate a ${info.orgName}`}
      subtitle={`Entrarás como ${(info.roleName ?? ROLE_COPY[info.role].name).toLowerCase()}. ${ROLE_COPY[info.role].description}`}
      art={art}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormError>{accept.error ? humanError(accept.error) : null}</FormError>
        {info.email ? (
          <Field label="Correo">
            <Input value={info.email} readOnly size="lg" />
          </Field>
        ) : (
          <Field label="Tu correo" error={errors.email}>
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@taller.cl"
              size="lg"
            />
          </Field>
        )}
        <Field label="Tu nombre" error={errors.name}>
          <Input autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana Pérez" size="lg" />
        </Field>
        <Field label="Contraseña" hint={`Al menos ${MIN_PASSWORD} caracteres.`} error={errors.password}>
          <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} size="lg" />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={accept.isPending} className="w-full">
          Unirme al equipo
        </Button>
      </form>
    </AuthLayout>
  )
}
