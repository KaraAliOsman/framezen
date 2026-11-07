import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { OrgTile } from '../../app/shell/Sidebar'
import { humanError } from '../../lib/api'
import { useAcceptInvitation } from '../../lib/auth'
import { firstName } from '../../lib/format'
import { useInvitation } from '../../lib/hooks'
import { useGlossary, useT } from '../../lib/i18n'
import { Button, buttonClass, Field, Input, Skeleton, toast } from '../../ui'
import { AuthLayout, FormError, type AuthArtSpec } from './AuthLayout'
import es from './i18n/es'
import { PasswordInput } from './PasswordInput'
import { emailError, MIN_PASSWORD, passwordError } from './validation'

export default function InvitationPage() {
  const t = useT(es)
  const g = useGlossary()
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const invitation = useInvitation(token)
  const accept = useAcceptInvitation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({})

  const info = invitation.data
  const art = useMemo<AuthArtSpec>(() => ({ typology: 'casement_double', width: 1400, height: 1300, colorId: 'antracita' }), [])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const finalEmail = (info?.email ?? email).trim()
    const next = {
      name: name.trim() ? undefined : t('validation.nameRequired'),
      email: info?.email ? undefined : emailError(email),
      password: passwordError(password),
    }
    setErrors(next)
    if (next.name || next.email || next.password) return
    accept.mutate(
      { token, name: name.trim(), email: finalEmail, password },
      {
        onSuccess: (me) => {
          toast.success(t('invitation.welcome', { name: firstName(me.user.name) }))
          navigate('/inicio', { replace: true })
        },
      },
    )
  }

  if (invitation.isPending) {
    return (
      <AuthLayout pageTitle={t('invitation.pageTitle')} title={t('invitation.opening')} art={art}>
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </AuthLayout>
    )
  }

  if (invitation.isError || !info) {
    return (
      <AuthLayout pageTitle={t('invitation.pageTitle')} title={t('invitation.invalidTitle')} subtitle={t('invitation.invalidText')} art={art}>
        <div className="flex flex-col gap-3">
          {invitation.error ? <FormError>{humanError(invitation.error)}</FormError> : null}
          <Link to="/entrar" className={buttonClass('primary', 'lg', 'w-full')}>
            {t('invitation.loginWithAccount')}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  const roleLabel = info.roleName ?? g.role(info.role)

  return (
    <AuthLayout
      pageTitle={t('invitation.joinTitle', { org: info.orgName })}
      title={t('invitation.joinTitle', { org: info.orgName })}
      subtitle={t('invitation.joinSubtitle')}
      art={art}
    >
      <div className="mb-3 flex items-center gap-3">
        <OrgTile name={info.orgName} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-fg-strong">{info.orgName}</p>
          {info.invitedBy ? <p className="truncate text-table text-fg-muted">{t('invitation.invitedBy', { name: info.invitedBy })}</p> : null}
        </div>
        <p className="shrink-0 text-right text-table text-fg">
          <span className="sr-only">{t('invitation.role')}: </span>
          {roleLabel}
        </p>
      </div>
      <p className="mb-6 text-table text-fg-muted">{g.roleDescription(info.role)}</p>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormError>{accept.error ? humanError(accept.error) : null}</FormError>
        {info.email ? (
          <Field label={t('fields.email')}>
            <Input value={info.email} readOnly />
          </Field>
        ) : (
          <Field label={t('invitation.yourEmail')} error={errors.email}>
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('fields.emailPlaceholder')}
             
            />
          </Field>
        )}
        <Field label={t('fields.name')} error={errors.name}>
          <Input autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('fields.namePlaceholder')} />
        </Field>
        <Field label={t('fields.password')} hint={t('fields.passwordHint', { min: MIN_PASSWORD })} error={errors.password}>
          <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={accept.isPending} className="w-full">
          {t('invitation.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
