/**
 * Avatar de un asistente en Ajustes. Usa el `AssistantAvatar` de AVATAR (contrato
 * `<AssistantAvatar spec state size />` en `features/assistant/avatar`) cuando está disponible; si no,
 * dibuja una ficha quieta con la forma y los colores del mismo `AvatarSpec`. Se carga aparte: Ajustes
 * no depende del motor de animación para abrir.
 */
import { useEffect, useState, type ComponentType } from 'react'
import { avatarColors, normalizeAvatarSpec, type AvatarSpec } from '@dekopen/shared'
import { cn } from '../../../lib/cn'

interface AvatarContractProps {
  spec: AvatarSpec
  state?: string
  size?: number
  className?: string
  title?: string
}

type AvatarModule = { AssistantAvatar?: ComponentType<AvatarContractProps> }

const loaders = import.meta.glob<AvatarModule>('../../assistant/avatar/index.ts')
let resolved: ComponentType<AvatarContractProps> | null | undefined
let pending: Promise<ComponentType<AvatarContractProps> | null> | null = null

function loadAvatar(): Promise<ComponentType<AvatarContractProps> | null> {
  if (resolved !== undefined) return Promise.resolve(resolved)
  if (!pending) {
    const load = Object.values(loaders)[0]
    pending = (load ? load() : Promise.resolve({} as AvatarModule))
      .then((mod) => (resolved = typeof mod.AssistantAvatar === 'function' || typeof mod.AssistantAvatar === 'object' ? (mod.AssistantAvatar ?? null) : null))
      .catch(() => (resolved = null))
  }
  return pending
}

export function AssistantMark({ spec, size = 32, className, title }: { spec: unknown; size?: number; className?: string; title?: string }) {
  const safe = normalizeAvatarSpec(spec)
  const [Avatar, setAvatar] = useState<ComponentType<AvatarContractProps> | null>(() => resolved ?? null)
  useEffect(() => {
    let alive = true
    void loadAvatar().then((component) => alive && setAvatar(() => component))
    return () => {
      alive = false
    }
  }, [])
  if (Avatar) return <Avatar spec={safe} state="idle" size={size} className={className} title={title} />
  return <StaticMark spec={safe} size={size} className={className} title={title} />
}

/** Ficha quieta: forma aproximada, color del cuerpo y ojos de cápsula (estilo bloub). */
function StaticMark({ spec, size, className, title }: { spec: AvatarSpec; size: number; className?: string; title?: string }) {
  const { body, eye, accent } = avatarColors(spec)
  const radius = spec.shape === 'circle' || spec.shape === 'blob' || spec.shape === 'pebble' || spec.shape === 'cloud' || spec.shape === 'egg' ? 50 : spec.shape === 'window' ? 14 : 30
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn('shrink-0', className)}
    >
      <rect x="6" y="6" width="88" height="88" rx={radius} fill={body} />
      {spec.shape === 'window' ? (
        <rect x="17" y="17" width="66" height="66" rx="5" fill="none" stroke={accent} strokeWidth="4" opacity="0.6" />
      ) : null}
      <rect x="33" y="36" width="10" height="22" rx="5" fill={eye} />
      <rect x="57" y="36" width="10" height="22" rx="5" fill={eye} />
    </svg>
  )
}
