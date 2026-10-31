import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, Copy, Link2, Mail, UserMinus, UserPlus, X } from 'lucide-react'
import { PLANS, ROLE_COPY, planSeats, type Role } from '@framezen/shared'
import { humanError } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { formatDate } from '../../../lib/format'
import { usePlan } from '../../../lib/plan'
import { Avatar, Badge, Button, Field, Input, PlanGate, Select, Skeleton, toast, toastUndo, UPGRADE_PATH } from '../../../ui'
import { SectionHeader } from '../components/SectionHeader'
import { seatsLeft, teamApi, teamKey, useChangeRole, useInvite, useTeam, type TeamResponse } from '../lib/accountApi'

const ROLES: Role[] = ['owner', 'estimator', 'workshop', 'operator', 'installer']

function roleOptions() {
  return ROLES.map((role) => ({ value: role, label: ROLE_COPY[role].name, description: ROLE_COPY[role].description }))
}

/** Equipo: personas, invitaciones por enlace, roles (si el plan los tiene) y cupos. */
export function TeamSection() {
  const me = useSession()
  const plan = usePlan()
  const team = useTeam()
  const client = useQueryClient()
  const changeRole = useChangeRole()
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

  return (
    <div>
      <SectionHeader
        title="Equipo"
        description={
          hasRoles
            ? 'Quién trabaja en tu cuenta y qué ve cada persona.'
            : 'Quién trabaja en tu cuenta. Todos ven y hacen lo mismo; el plan y el equipo los maneja el dueño.'
        }
        aside={
          team.data && team.data.seats !== null ? (
            <Badge tone={full ? 'warn' : 'neutral'}>
              {team.data.members.length + team.data.invitations.length} de {team.data.seats} {team.data.seats === 1 ? 'persona' : 'personas'}
            </Badge>
          ) : null
        }
      />

      {team.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : team.isError ? (
        <p className="rounded-md border border-paper-200 bg-paper-0 px-4 py-6 text-center text-paper-600">
          {humanError(team.error)}{' '}
          <button type="button" className="font-medium text-ink-600 hover:text-ink-700" onClick={() => void team.refetch()}>
            Reintentar
          </button>
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {isOwner ? full ? <SeatGate seats={team.data.seats ?? 1} /> : <InviteForm hasRoles={hasRoles} left={left} /> : null}

          <section aria-labelledby="team-members">
            <h3 id="team-members" className="mb-2 text-[13px] font-semibold text-paper-900">
              Personas
            </h3>
            <ul className="divide-y divide-paper-200 overflow-hidden rounded-md border border-paper-200 bg-paper-0">
              {team.data.members.map((member) => (
                <li key={member.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <Avatar name={member.name} tone={member.isYou ? 'ink' : 'paper'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-paper-900">
                      {member.name}
                      {member.isYou ? <span className="ml-1.5 font-normal text-paper-600">(tú)</span> : null}
                    </p>
                    <p className="truncate text-[13px] text-paper-600">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasRoles && isOwner && !member.isYou ? (
                      <Select
                        aria-label={`Rol de ${member.name}`}
                        size="sm"
                        value={member.role}
                        onValueChange={(role) =>
                          changeRole.mutate(
                            { userId: member.userId, role },
                            {
                              onSuccess: () => toast.success(`${member.name.split(' ')[0]} ahora es ${ROLE_COPY[role].name.toLowerCase()}`),
                              onError: (error) => toast.error(humanError(error)),
                            },
                          )
                        }
                        options={roleOptions()}
                        className="w-40"
                      />
                    ) : (
                      <Badge tone={member.role === 'owner' ? 'ink' : 'neutral'}>{hasRoles || member.role === 'owner' ? ROLE_COPY[member.role].name : 'Miembro'}</Badge>
                    )}
                    {isOwner && !member.isYou ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={UserMinus}
                        aria-label={`Quitar a ${member.name}`}
                        onClick={() => deferRemoval('member', member.userId, `Quitaste a ${member.name} del equipo`)}
                      >
                        <span className="max-sm:sr-only">Quitar</span>
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {team.data.invitations.length ? (
            <section aria-labelledby="team-invites">
              <h3 id="team-invites" className="mb-2 text-[13px] font-semibold text-paper-900">
                Invitaciones pendientes
              </h3>
              <ul className="divide-y divide-paper-200 overflow-hidden rounded-md border border-dashed border-paper-350/60 bg-paper-0">
                {team.data.invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <span className="inline-flex size-8 items-center justify-center rounded-full border border-dashed border-paper-350 text-paper-600">
                      {inv.email ? <Mail aria-hidden className="size-4" strokeWidth={1.75} /> : <Link2 aria-hidden className="size-4" strokeWidth={1.75} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-paper-900">{inv.email ?? 'Enlace de invitación'}</p>
                      <p className="text-[13px] text-paper-600">
                        {hasRoles ? `${ROLE_COPY[inv.role].name} · ` : ''}Vale hasta el {formatDate(inv.expiresAt)}
                      </p>
                    </div>
                    {isOwner ? (
                      <Button size="sm" variant="ghost" icon={X} onClick={() => deferRemoval('invitation', inv.id, 'Anulaste la invitación')}>
                        Anular
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!hasRoles ? <PlanGate feature="roles" variant="inline" /> : null}
          {!isOwner ? <p className="text-[13px] text-paper-600">Solo el dueño de la cuenta puede invitar o quitar personas.</p> : null}
        </div>
      )}
    </div>
  )
}

function InviteForm({ hasRoles, left }: { hasRoles: boolean; left: number | null }) {
  const invite = useInvite()
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
          if (trimmed) toast.success(`Le enviamos la invitación a ${trimmed}`)
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
      toast.success('Enlace copiado')
    } catch {
      toast('Copia el enlace a mano: está seleccionado')
    }
  }

  return (
    <section aria-labelledby="team-invite" className="rounded-lg border border-paper-200 bg-paper-0 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="team-invite" className="font-semibold text-paper-900">
          Invitar a alguien
        </h3>
        {left !== null ? (
          <span className="text-[13px] text-paper-600">
            {left === 1 ? 'Te queda 1 cupo' : `Te quedan ${left} cupos`}
          </span>
        ) : null}
      </div>
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Correo" optional hint="Sin correo, te damos un enlace para mandarlo por WhatsApp.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ana@tutaller.cl" autoComplete="off" />
        </Field>
        {hasRoles ? (
          <Field label="Rol">
            <Select value={role} onValueChange={setRole} options={roleOptions()} className="sm:w-44" />
          </Field>
        ) : null}
        <Button type="submit" variant="primary" icon={UserPlus} loading={invite.isPending} className="sm:mb-[22px]">
          {email.trim() ? 'Invitar' : 'Crear enlace'}
        </Button>
      </form>
      {link ? (
        <div className="mt-4 flex flex-col gap-2 rounded-md bg-ink-50/70 p-3 sm:flex-row sm:items-center">
          <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de invitación" className="font-mono text-[12px] sm:flex-1" />
          <div className="flex gap-2">
            <Button size="md" icon={copied ? Check : Copy} onClick={() => void copy()}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            <Button
              size="md"
              variant="ghost"
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Te invito a nuestra cuenta de Framezen: ${link}`)}`, '_blank', 'noopener')}
            >
              WhatsApp
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** Sin cupos: explica y ofrece mejorar, sin bloquear nada de lo demás. */
function SeatGate({ seats }: { seats: number }) {
  const plan = usePlan()
  const next = useMemo(() => {
    const unlimited = PLANS.empresa
    return planSeats(plan?.code ?? 'trial') === null ? null : unlimited
  }, [plan?.code])
  return (
    <section className="flex flex-col gap-4 rounded-md border border-ink-100 bg-ink-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-paper-900">Tu plan ya tiene sus {seats === 1 ? 'cupo ocupado' : `${seats} cupos ocupados`}</h3>
          {next ? (
            <Badge tone="ink" size="sm">
              Plan {next.name}
            </Badge>
          ) : null}
        </div>
        <p className="max-w-xl text-paper-600">
          Contamos también las invitaciones pendientes: si alguna ya no sirve, anúlala y se libera el cupo. Con {next?.name ?? 'un plan mayor'} sumas a todo tu
          equipo, con roles para cada persona.
        </p>
      </div>
      <Link to={UPGRADE_PATH} className="inline-flex shrink-0 items-center gap-1.5 font-medium text-ink-600 hover:text-ink-700">
        Ver planes
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  )
}
