/**
 * Control de una unión: ángulo, dirección y pieza. Se abre sobre la unión en el dibujo y es el mismo
 * en el panel. Los ángulos de siempre están a un toque y se escribe cualquiera; si el catálogo no trae
 * la pieza se dice aquí y la unión queda fuera del total, sin bloquear ni reemplazarla por otra.
 */
import { useState, type ReactNode } from 'react'
import { foldAngle, lineCoupling, setAssemblyAngle, setAssemblyFront, setAssemblyJoint, assemblyUnits, type Catalog, type LayoutAssemblyJoint, type WindowDesign } from '@dekopen/engine'
import { cn } from '../../lib/cn'
import { useT } from '../../lib/i18n'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { SegmentedControl } from '../../ui/SegmentedControl'
import es from './i18n/es'
import { jointAngle, jointBreakable, signedAngle, typedAngle } from './lib/assembly'
import type { UndoKey } from './lib/undo'
import { SearchPicker } from './parts/SearchPicker'

/** Ángulos a un toque; 180 es la unión recta y se lee «0°». */
const QUICK_ANGLES = [180, 90, 135, 150]

const near = (a: number, b: number) => Math.abs(a - b) < 0.5

export const angleText = (post: number) => `${near(post, 180) ? 0 : String(Math.round(post * 10) / 10).replace('.', ',')}°`

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-meta text-fg-muted">{label}</span>
      {children}
    </div>
  )
}

function AngleInput({ value, label, placeholder, onCommit }: { value: number | null; label: string; placeholder: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft.trim() !== '') {
      const typed = Number(draft.trim().replace(',', '.').replace('°', ''))
      if (Number.isFinite(typed)) onCommit(typedAngle(typed))
    }
    setDraft(null)
  }
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      placeholder={placeholder}
      value={draft ?? (value === null ? '' : String(value).replace('.', ','))}
      onFocus={(e) => {
        setDraft(e.currentTarget.value)
        e.currentTarget.select()
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(null)
      }}
      className="dim h-8 w-16 text-center text-table touch:h-11"
    />
  )
}

export interface JointEditorProps {
  joint: LayoutAssemblyJoint
  design: WindowDesign
  catalog: Catalog
  onEmit: (next: WindowDesign, key: UndoKey) => void
  /** Vista exterior: izquierda y derecha se ven al revés. */
  mirror?: boolean
  /** Con ancho de sobra, dirección y giro van lado a lado. */
  wide?: boolean
}

export function JointEditor({ joint, design, catalog, onEmit, mirror = false, wide = false }: JointEditorProps) {
  const t = useT(es)
  const breakable = jointBreakable(design, joint)
  const raw = jointAngle(design, joint)
  const post = foldAngle(raw)
  const flat = near(post, 180)
  const inward = raw > 180.5
  const root = design.assembly?.root
  const lineIds = assemblyUnits(design).filter((u) => joint.label.split('–').includes(u.id)).map((u) => u.design.lineId)
  const breaks = root?.joints.filter((j) => !near(foldAngle(j.angle), 180)).length ?? 0
  const uneven = root?.joints.some((j) => j.angle !== raw) ?? false
  const candidates = lineIds.flatMap((id) => {
    const c = lineCoupling(id, catalog)
    if (flat) return c.flat
    return [...c.corners.filter((p) => near(p.angle, post)).map((p) => p.profile), ...c.variable.map((v) => v.profile), ...(near(post, 90) ? c.undeclared : [])]
  })
  const profiles = [...new Map(candidates.map((p) => [p.id, p])).values()]
  const quick = [...new Set([...QUICK_ANGLES, ...lineIds.flatMap((id) => lineCoupling(id, catalog).corners.map((c) => c.angle))])]
  const setPost = (next: number) => onEmit(setAssemblyJoint(design, joint.groupId, joint.index, { angle: signedAngle(next, inward), profileId: undefined }, catalog), 'assemblyJoint')
  const setInward = (next: boolean) => onEmit(setAssemblyJoint(design, joint.groupId, joint.index, { angle: signedAngle(post, next) }, catalog), 'assemblyJoint')
  const sides = [
    { value: 'left', label: t('common.left') },
    { value: 'right', label: t('common.right') },
  ]
  return (
    <div className="flex flex-col gap-3" data-joint-editor={joint.id}>
      {breakable ? (
        <>
          <div className="flex flex-wrap items-center gap-1">
            <div role="radiogroup" aria-label={t('assembly.angleFor', { label: joint.label })} className="contents">
              {quick.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={near(a, post)}
                  onClick={() => setPost(a)}
                  className={cn(
                    'dim h-8 min-w-10 rounded-sm border px-1.5 text-table transition-colors duration-100 touch:h-11',
                    near(a, post) ? 'border-accent font-medium text-fg-strong' : 'border-divider bg-surface text-fg-muted hover:border-divider-strong hover:text-fg-strong',
                  )}
                >
                  {angleText(a)}
                </button>
              ))}
            </div>
            <AngleInput key={post} value={quick.some((a) => near(a, post)) ? null : post} label={t('assembly.customAngle')} placeholder={t('assembly.other')} onCommit={setPost} />
          </div>
          {flat ? null : (
            <div className={cn('flex gap-3', wide ? 'flex-wrap *:flex-auto' : 'flex-col')}>
              <Group label={t('assembly.direction')}>
                <SegmentedControl
                  aria-label={t('assembly.direction')}
                  size="sm"
                  block
                  value={inward ? 'in' : 'out'}
                  onValueChange={(v) => setInward(v === 'in')}
                  options={[
                    { value: 'out', label: t('assembly.outward') },
                    { value: 'in', label: t('assembly.inward') },
                  ]}
                />
              </Group>
              {breaks === 1 ? (
                <Group label={t('assembly.turns')}>
                  <SegmentedControl
                    aria-label={t('assembly.turns')}
                    size="sm"
                    block
                    value={(design.assembly?.front === 'start') !== mirror ? 'right' : 'left'}
                    onValueChange={(v) => onEmit(setAssemblyFront(design, (v === 'right') !== mirror ? 'start' : 'end', catalog), 'assemblyJoint')}
                    options={sides}
                  />
                </Group>
              ) : null}
            </div>
          )}
          {uneven && (root?.joints.length ?? 0) > 1 ? (
            <Button size="xs" variant="ghost" className="-mx-1 w-fit px-1" onClick={() => onEmit(setAssemblyAngle(design, raw, catalog), 'assemblyJoint')}>
              {t('assembly.useAll')}
            </Button>
          ) : null}
        </>
      ) : null}
      {joint.status === 'missing' ? (
        <p className="text-meta font-medium text-danger" role="status">
          {flat ? t('assembly.noCoupler') : t('assembly.noPost', { angle: post })}
        </p>
      ) : profiles.length > 1 ? (
        <SearchPicker
          size="sm"
          aria-label={t('assembly.profileFor', { label: joint.label })}
          value={joint.profileId}
          onChange={(profileId) => onEmit(setAssemblyJoint(design, joint.groupId, joint.index, { profileId }, catalog), 'assemblyJoint')}
          groups={[{ id: 'p', items: profiles.map((p) => ({ value: p.id, label: p.name, hint: p.code, keywords: [p.code] })) }]}
        />
      ) : (
        <p className="truncate text-meta text-fg-muted">
          {joint.code} · {joint.name}
        </p>
      )}
      {joint.status === 'unverified' ? <p className="text-meta text-fg-muted">{t('assembly.unverified')}</p> : null}
    </div>
  )
}
