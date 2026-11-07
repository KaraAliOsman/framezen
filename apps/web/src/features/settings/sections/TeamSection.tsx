import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, Copy, Link2, Mail, UserMinus, UserPlus, X } from 'lucide-react'
import { intlTag, PLANS, planSeats, type Role } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { usePlan } from '../../../lib/plan'
import { Avatar, Button, Field, Input, PlanGate, Select, Skeleton, toast, toastUndo, UPGRADE_PATH } from '../../../ui'
import { FieldGroup, SectionHeader } from '../components/SectionHeader'
import es from '../i18n/es'
import { seatsLeft, teamApi, teamKey, useChangeRole, useInvite, useTeam, type TeamResponse } from '../lib/accountApi'

const ROLES: Role[] = ['owner', 'estimator', 'workshop', 'operator', 'installer']

function useRoleOptions() {
  const g = useGlossary()
  return useMemo(() => ROLES.map((role) => ({ value: role, label: g.role(role), description: g.roleDescription(role) })), [g])
}

/** Equipo: personas, invitaciones por enlace, roles (si el plan los tiene) y cupos. */
export function TeamSection() {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const me = useSession()
  const plan = usePlan()
  const team = useTeam()
  const client = useQueryClient()
  const changeRole = useChangeRole()
  const roleOptions = useRoleOptions()
  const isOwner = me.role === 'owner'
  const hasRoles = plan?.has('roles') ?? false
  const left = seatsLeft(team.data)
  const full = left !== null && left <= 0

  /** Quita en pantalla al tiro y confirma en el servidor si no se deshace en 8 s. */
  const deferRemoval = (kind: 'member' | 'invitation', id: string, label: string) => {
    const previous = client.getQueryData<TeamResponse>(teamKey)
    if (!previous) return
    client.setQueryData<TeamResponse>(teamKey, {
      ...previous,
      members: kind === 'member' ? previous.members.filter((m) => m.userId !== id) : previous.members,
      invitations: kind === 'invitation' ? previous.invitations.filter((i) => i.id !== id) : previous.invitations,
    })
    toastUndo(label, () => client.setQueryData(teamKey, previous), {
      onCommit: () => {
        const action = kind === 'member' ? teamApi.removeMember(id) : teamApi.revokeInvitation(id)
        action
          .catch((error) => {
            client.setQueryData(teamKey, previous)
            toast.error(humanError(error))
          })
          .finally(() => void client.invalidateQueries({ queryKey: teamKey }))
      },
    })
  }

  /** «cotizador» en minúscula donde corresponde (en alemán los sustantivos van con mayúscula). */
  const roleInSentence = (role: Role) => (t.locale === 'de' ? g.role(role) : g.role(role).toLocaleLowerCase(intlTag(t.locale)))

  return (
    <div>
      <SectionHeader
        title={t('team.title')}
        description={hasRoles ? t('team.descriptionRoles') : t('team.descriptionNoRoles')}
        aside={
          team.data && team.data.seats !== null ? (
            <span className={full ? 'text-table text-warning tabular' : 'text-table text-fg-muted tabular'}>{t('team.seats', { used: team.data.members.length + team.data.invitations.length, seats: team.data.seats })}</span>
          ) : null
        }
      />

      {team.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : team.isError ? (
        <p className="text-fg-muted">
          {humanError(team.error)}{' '}
          <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => void team.refetch()}>
            {t('common.retry')}
          </button>
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          {isOwner ? full ? <SeatGate seats={team.data.seats ?? 1} /> : <InviteForm hasRoles={hasRoles} left={left} /> : null}

          <FieldGroup id="team-members" title={t('team.people')}>
            <ul className="divide-y divide-divider">
              {team.data.members.map((member) => (
                <li key={member.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0">
                  <Avatar name={member.name} tone={member.isYou ? 'ink' : 'paper'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg-strong">
                      {member.name}
                      {member.isYou ? <span className="ml-1.5 font-normal text-fg-muted">{t('team.you')}</span> : null}
                    </p>
                    <p className="truncate text-table text-fg-muted">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasRoles && isOwner && !member.isYou ? (
                      <Select
                        aria-label={t('team.roleAria', { name: member.name })}
                        size="sm"
                        value={member.role}
                        onValueChange={(role) =>
                          changeRole.mutate(
                            { userId: member.userId, role },
                            {
                              onSuccess: () => toast.success(t('team.roleChanged', { name: member.name.split(' ')[0] ?? member.name, role: roleInSentence(role) })),
                              onError: (error) => toast.error(humanError(error)),
                            },
                          )
                        }
                        options={roleOptions}
                        className="w-44"
                      />
                    ) : (
                      <span className="text-table text-fg-muted">{hasRoles || member.role === 'owner' ? g.role(member.role) : t('team.member')}</span>
                    )}
                    {isOwner && !member.isYou ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={UserMinus}
                        aria-label={t('team.removeAria', { name: member.name })}
                        onClick={() => deferRemoval('member', member.userId, t('team.removed', { name: member.name }))}
                      >
                        <span className="max-sm:sr-only">{t('team.remove')}</span>
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </FieldGroup>

          {team.data.invitations.length ? (
            <FieldGroup id="team-invites" title={t('team.invites')}>
              <ul className="divide-y divide-divider">
                {team.data.invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0">
                    <span className="inline-flex size-8 items-center justify-center text-fg-muted">
                      {inv.email ? <Mail aria-hidden className="size-4" strokeWidth={1.75} /> : <Link2 aria-hidden className="size-4" strokeWidth={1.75} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-fg">{inv.email ?? t('team.inviteLink')}</p>
                      <p className="text-table text-fg-muted">
                        {hasRoles ? t('team.validUntilRole', { role: g.role(inv.role), date: fmt.date(inv.expiresAt) }) : t('team.validUntil', { date: fmt.date(inv.expiresAt) })}
                      </p>
                    </div>
                    {isOwner ? (
                      <Button size="sm" variant="ghost" icon={X} onClick={() => deferRemoval('invitation', inv.id, t('team.revoked'))}>
                        {t('team.revoke')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </FieldGroup>
          ) : null}

          {!hasRoles ? <PlanGate feature="roles" variant="inline" /> : null}
          {!isOwner ? <p className="text-table text-fg-muted">{t('team.ownerOnly')}</p> : null}
        </div>
      )}
    </div>
  )
}

function InviteForm({ hasRoles, left }: { hasRoles: boolean; left: number | null }) {
  const t = useT(es)
  const invite = useInvite()
  const roleOptions = useRoleOptions()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('estimator')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = () => {
    const trimmed = email.trim()
    invite.mutate(
      { email: trimmed || undefined, role },
      {
        onSuccess: (result) => {
          setLink(result.link)
          setCopied(false)
          setEmail('')
          if (trimmed) toast.success(t('team.invite.sent', { email: trimmed }))
        },
        onError: (error) => toast.error(humanError(error)),
      },
    )
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success(t('team.invite.copied'))
    } catch {
      toast(t('team.invite.copyManual'))
    }
  }

  return (
    <FieldGroup
      id="team-invite"
      title={t('team.invite.title')}
      description={t('team.invite.description')}
      aside={left !== null ? <span className="text-table text-fg-muted">{t('team.invite.left', { count: left })}</span> : null}
    >
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label={t('team.invite.email')} optional hint={t('team.invite.emailHint')}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('team.invite.emailPlaceholder')} autoComplete="off" />
        </Field>
        {hasRoles ? (
          <Field label={t('team.invite.role')}>
            <Select value={role} onValueChange={setRole} options={roleOptions} className="sm:w-48" />
          </Field>
        ) : null}
        <Button type="submit" variant="primary" icon={UserPlus} loading={invite.isPending} className="sm:mb-6">
          {email.trim() ? t('team.invite.submitEmail') : t('team.invite.submitLink')}
        </Button>
      </form>
      {link ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={t('team.invite.linkAria')} wrapperClassName="sm:flex-1" />
          <div className="flex gap-2">
            <Button size="md" icon={copied ? Check : Copy} onClick={() => void copy()}>
              {copied ? t('team.invite.copiedButton') : t('team.invite.copy')}
            </Button>
            <Button
              size="md"
              variant="ghost"
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(t('team.invite.whatsappText', { link }))}`, '_blank', 'noopener')}
            >
              {t('team.invite.whatsapp')}
            </Button>
          </div>
        </div>
      ) : null}
    </FieldGroup>
  )
}

/** Sin cupos: explica y ofrece mejorar, sin bloquear nada de lo demás. */
function SeatGate({ seats }: { seats: number }) {
  const t = useT(es)
  const g = useGlossary()
  const plan = usePlan()
  const next = useMemo(() => (planSeats(plan?.code ?? 'trial') === null ? null : PLANS.empresa), [plan?.code])
  const nextName = next ? g.plan(next.code) : t('team.seatGate.biggerPlan')
  return (
    <section className="flex flex-col gap-3 rounded-sm bg-sunken px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="font-medium text-fg-strong">{t('team.seatGate.title', { seats })}</h3>
        <p className="max-w-xl text-table text-fg-muted">{t('team.seatGate.body', { plan: nextName })}</p>
      </div>
      <Link to={UPGRADE_PATH} className="inline-flex shrink-0 items-center gap-1.5 text-table font-medium text-accent-ink hover:underline">
        {t('team.seatGate.seePlans')}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  )
}
