/*
 * Diseñador de avatar (DEKOPEN): vista previa viva que recorre los estados, el avatar en sus
 * tamaños reales dentro de la app y selectores de forma, color, ojos, accesorio y movimiento.
 * Lo monta el editor de asistentes (equipo BOT-UI): controlado, sin guardar nada por su cuenta.
 */
import {
  AVATAR_ACCESSORIES,
  AVATAR_EYES,
  AVATAR_MOTIONS,
  AVATAR_PALETTES,
  AVATAR_PALETTE_IDS,
  AVATAR_SHAPES,
  DEFAULT_AVATAR,
  normalizeAvatarSpec,
  type AvatarColors,
  type AvatarSpec,
} from '@dekopen/shared'
import { Dices, Pause, Pipette, Play, RotateCcw } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { Button, IconButton, Input, Notice, SegmentedControl, Tooltip } from '../../../ui'
import { AssistantAvatar } from './AssistantAvatar'
import { adviseColors, startingCustomColors } from './colors'
import type { AvatarState } from './engine/director'
import { createRng } from './engine/math'
import { useAvatarLabels } from './labels'
import { prefersReducedMotion, subscribeReducedMotion } from './runtime'
import es from './i18n/es'

export interface AvatarDesignerProps {
  /** aspecto actual (se repara si viene incompleto) */
  value: Partial<AvatarSpec> | null | undefined
  onChange: (next: AvatarSpec) => void
  /** nombre del asistente, bajo la vista previa */
  name?: string
  disabled?: boolean
  /** 'stacked' = vista previa arriba aunque haya ancho (hojas angostas) */
  layout?: 'auto' | 'stacked'
  className?: string
}

/** Recorrido de la vista previa: cada estado el tiempo justo para leerse. */
const CYCLE: { state: AvatarState; ms: number }[] = [
  { state: 'idle', ms: 2600 },
  { state: 'listening', ms: 2000 },
  { state: 'thinking', ms: 2200 },
  { state: 'working', ms: 2600 },
  { state: 'speaking', ms: 2400 },
  { state: 'done', ms: 3400 },
  { state: 'approval', ms: 2600 },
  { state: 'celebrate', ms: 3000 },
  { state: 'error', ms: 2400 },
  { state: 'sleep', ms: 3200 },
  { state: 'swirl', ms: 1900 },
]

/** Estados que se pueden fijar a mano en la vista previa. */
const PICKABLE: AvatarState[] = ['idle', 'listening', 'thinking', 'working', 'speaking', 'done', 'approval', 'error', 'sleep', 'alert', 'celebrate', 'orbit', 'swirl']

const HEX = /^#?([0-9a-f]{6})$/i

/**
 * Avatar al azar, pero con criterio: paletas con nombre (contraste probado), ojos y forma
 * libres, accesorio solo a veces. `seed` lo vuelve determinista (pruebas).
 */
export function randomAvatar(current: Partial<AvatarSpec> = DEFAULT_AVATAR, seed?: number): AvatarSpec {
  const rnd = seed === undefined ? Math.random : createRng(seed)
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length) % list.length]
  const base = normalizeAvatarSpec(current)
  const draw = (): AvatarSpec => ({
    version: 1,
    shape: pick(AVATAR_SHAPES),
    palette: pick(AVATAR_PALETTE_IDS),
    eyes: pick(AVATAR_EYES),
    accessory: rnd() < 0.45 ? 'none' : pick(AVATAR_ACCESSORIES.filter((a) => a !== 'none')),
    motion: base.motion,
  })
  // nunca devuelve exactamente el mismo
  let next = draw()
  for (let i = 0; i < 6 && next.shape === base.shape && next.palette === base.palette && next.eyes === base.eyes; i++) next = draw()
  return next
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false)
}

/* ------------------------------------------------------------- piezas locales */

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 id={id} className="text-table font-medium text-fg">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

interface TileOption<V extends string> {
  value: V
  label: string
  media: ReactNode
}

function TileGroup<V extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
  className,
}: {
  value: V
  onChange: (value: V) => void
  options: TileOption<V>[]
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as V)}
      aria-label={label}
      disabled={disabled}
      className={cn('grid gap-2', className)}
    >
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className={cn(
            'group flex min-w-0 flex-col items-center gap-1.5 rounded-md border border-divider bg-surface px-1 pb-2 pt-2.5',
            'transition-[border-color,background-color,box-shadow] duration-100 ease-out hover:border-divider-strong hover:bg-sunken',
            'data-[state=checked]:border-accent data-[state=checked]:bg-accent-subtle/50 data-[state=checked]:shadow-[inset_0_0_0_1px_var(--dk-accent)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span className="pointer-events-none flex h-11 items-center justify-center">{option.media}</span>
          <span className="w-full truncate text-center text-meta text-fg-muted group-data-[state=checked]:font-medium group-data-[state=checked]:text-accent-ink">
            {option.label}
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}

/** Muestra de paleta: el cuerpo con dos ojitos y el acento abajo (se lee como un avatar). */
function PaletteSwatch({ colors }: { colors: AvatarColors }) {
  return (
    <span className="relative block size-full overflow-hidden rounded-xs border border-black/10 dark:border-white/15" style={{ background: colors.body }}>
      <span className="absolute left-[30%] top-[30%] h-[34%] w-[13%] rounded-full" style={{ background: colors.eye }} />
      <span className="absolute left-[57%] top-[30%] h-[34%] w-[13%] rounded-full" style={{ background: colors.eye }} />
      <span className="absolute inset-x-0 bottom-0 h-[18%]" style={{ background: colors.accent }} />
    </span>
  )
}

const swatchItem = cn(
  'relative inline-flex size-10 items-center justify-center rounded-sm p-[3px] transition-shadow duration-100 ease-out',
  'hover:shadow-[0_0_0_1px_var(--dk-divider-strong)] focus-visible:outline-offset-1 data-[state=checked]:shadow-[0_0_0_2px_var(--dk-accent)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
)

function ColorField({
  part,
  label,
  value,
  onChange,
  disabled,
}: {
  part: keyof AvatarColors
  label: string
  value: string
  onChange: (part: keyof AvatarColors, hex: string) => void
  disabled?: boolean
}) {
  const t = useT(es)
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (raw: string) => {
    const m = HEX.exec(raw.trim())
    if (m) onChange(part, `#${m[1].toUpperCase()}`)
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-table text-fg-muted">{label}</span>
      <div className="flex items-center gap-2">
        <label
          className={cn(
            'relative inline-flex size-8 shrink-0 cursor-pointer overflow-hidden rounded-sm border border-black/15 shadow-xs dark:border-white/15',
            'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          style={{ background: value }}
        >
          <input
            type="color"
            value={value.toLowerCase()}
            disabled={disabled}
            aria-label={t('designer.pickColorOf', { part: label })}
            onChange={(e) => onChange(part, e.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <Input
          size="sm"
          value={draft}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          aria-label={t('designer.hexOf', { part: label })}
          onChange={(e) => {
            setDraft(e.target.value)
            commit(e.target.value)
          }}
          onBlur={() => setDraft(value)}
          className="code-id"
          wrapperClassName="min-w-0 flex-1"
        />
      </div>
    </div>
  )
}

/** El avatar en sus tamaños reales: barra superior (34), cabecera del panel (28) y mensajes (20). */
function InAppPreview({ spec, name, state }: { spec: AvatarSpec; name: string; state: AvatarState }) {
  const t = useT(es)
  return (
    <div className="overflow-hidden rounded-panel border border-divider bg-surface">
      <p className="border-b border-divider bg-sunken px-3 py-1.5 text-meta text-fg-muted">{t('designer.inApp')}</p>
      <div className="flex h-12 items-center gap-2 border-b border-divider px-3">
        <span className="sr-only">{t('designer.sizeTopbar')}</span>
        <span aria-hidden className="h-2 w-14 rounded-full bg-hover" />
        <span aria-hidden className="h-2 w-8 rounded-full bg-hover" />
        <span className="ml-auto" />
        <AssistantAvatar spec={spec} state={state} size={34} />
        <span aria-hidden className="size-7 rounded-full bg-hover" />
      </div>
      <div className="flex h-11 items-center gap-2 border-b border-divider px-3">
        <span className="sr-only">{t('designer.sizePanel')}</span>
        <AssistantAvatar spec={spec} state={state} size={28} />
        <span className="min-w-0 truncate text-table font-medium text-fg-strong">{name}</span>
      </div>
      <div className="flex items-start gap-2 px-3 py-2.5">
        <span className="sr-only">{t('designer.sizeMessage')}</span>
        <AssistantAvatar spec={spec} state="idle" size={20} animated={false} />
        <span aria-hidden className="flex flex-1 flex-col gap-1.5 pt-1">
          <span className="h-2 w-[86%] rounded-full bg-hover" />
          <span className="h-2 w-[58%] rounded-full bg-hover" />
        </span>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- diseñador */

export function AvatarDesigner({ value, onChange, name, disabled, layout = 'auto', className }: AvatarDesignerProps) {
  const t = useT(es)
  const labels = useAvatarLabels()
  const reduced = useReducedMotion()
  const valueKey = JSON.stringify(value ?? null)
  // la clave serializada es la dependencia: un objeto nuevo con el mismo contenido no rehace nada
  const spec = useMemo(() => normalizeAvatarSpec(value ?? {}), [valueKey])
  const displayName = name?.trim() || t('designer.unnamed')

  const [playing, setPlaying] = useState(!reduced)
  const [index, setIndex] = useState(0)
  const [restart, setRestart] = useState(0)
  const [manual, setManual] = useState<AvatarState>('idle')
  const state = playing ? CYCLE[index].state : manual

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % CYCLE.length), CYCLE[index].ms)
    return () => window.clearTimeout(timer)
  }, [playing, index, restart])

  /** Cada cambio vuelve a mostrar la cara (en «pensando» no se vería un accesorio nuevo). */
  const change = (patch: Partial<AvatarSpec>) => {
    const next = normalizeAvatarSpec({ ...spec, ...patch })
    if (next.palette !== 'custom') delete next.colors
    onChange(next)
    if (playing) {
      setIndex(0)
      setRestart((n) => n + 1)
    } else if (manual === 'thinking' || manual === 'alert') {
      setManual('idle')
    }
  }

  const customColors = spec.palette === 'custom' && spec.colors ? spec.colors : startingCustomColors(spec)
  const advice = spec.palette === 'custom' ? adviseColors(customColors) : null
  const tile = (patch: Partial<AvatarSpec>, size = 38) => (
    <AssistantAvatar spec={{ ...spec, ...patch }} state="idle" size={size} animated={false} />
  )

  return (
    <div
      role="group"
      aria-label={t('designer.label')}
      className={cn('grid gap-6', layout === 'auto' && 'md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]', className)}
    >
      {/* vista previa */}
      <div className={cn('flex min-w-0 flex-col gap-3', layout === 'auto' && 'md:sticky md:top-4 md:self-start')}>
        <div className="relative flex flex-col items-center rounded-panel border border-divider bg-sunken px-4 pb-4 pt-7">
          <IconButton
            icon={playing ? Pause : Play}
            label={playing ? t('designer.pause') : t('designer.play')}
            size="xs"
            className="absolute right-2 top-2"
            onClick={() => {
              if (playing) {
                setManual(state)
                setPlaying(false)
              } else {
                setIndex(0)
                setPlaying(true)
              }
            }}
          />
          <AssistantAvatar spec={spec} state={state} size={160} title={t('designer.previewOf', { name: displayName })} />
          <p className="mt-4 max-w-full truncate font-medium text-fg-strong">{displayName}</p>
          <p className="text-table text-fg-muted" aria-live="polite">
            {labels.stateName(state)}
          </p>
        </div>

        <div role="group" aria-label={t('designer.pickState')} className="flex flex-wrap gap-1">
          {PICKABLE.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={state === s}
              onClick={() => {
                setPlaying(false)
                setManual(s)
              }}
              className={cn(
                'h-7 rounded-xs border px-2 text-meta transition-colors duration-100 ease-out',
                state === s
                  ? 'border-accent-line bg-accent-subtle font-medium text-accent-ink'
                  : 'border-divider bg-surface text-fg-muted hover:border-divider-strong hover:text-fg',
              )}
            >
              {labels.stateName(s)}
            </button>
          ))}
        </div>

        <InAppPreview spec={spec} name={displayName} state={state} />
      </div>

      {/* selectores */}
      <div className="flex min-w-0 flex-col gap-6">
        <Section title={t('designer.shape')}>
          <TileGroup
            label={t('designer.shape')}
            value={spec.shape}
            disabled={disabled}
            onChange={(shape) => change({ shape })}
            className="grid-cols-4 sm:grid-cols-6"
            options={AVATAR_SHAPES.map((shape) => ({ value: shape, label: labels.shape(shape), media: tile({ shape, accessory: 'none' }) }))}
          />
        </Section>

        <Section title={t('designer.color')} aside={<span className="text-table text-fg-muted">{labels.palette(spec.palette)}</span>}>
          <RadioGroup.Root
            value={spec.palette}
            onValueChange={(palette) =>
              palette === 'custom'
                ? change({ palette: 'custom', colors: startingCustomColors(spec) })
                : change({ palette: palette as AvatarSpec['palette'] })
            }
            aria-label={t('designer.color')}
            disabled={disabled}
            orientation="horizontal"
            className="flex flex-wrap gap-1.5"
          >
            {AVATAR_PALETTE_IDS.map((id) => (
              <Tooltip key={id} content={labels.palette(id)}>
                <RadioGroup.Item value={id} aria-label={labels.palette(id)} className={swatchItem}>
                  <PaletteSwatch colors={AVATAR_PALETTES[id]} />
                </RadioGroup.Item>
              </Tooltip>
            ))}
            <Tooltip content={labels.palette('custom')}>
              <RadioGroup.Item value="custom" aria-label={labels.palette('custom')} className={swatchItem}>
                <span className="flex size-full items-center justify-center rounded-xs border border-dashed border-divider-strong bg-surface text-fg-muted">
                  <Pipette aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
              </RadioGroup.Item>
            </Tooltip>
          </RadioGroup.Root>

          {spec.palette === 'custom' ? (
            <div className="flex flex-col gap-3 rounded-md border border-divider bg-sunken p-3">
              <p className="text-table font-medium text-fg">{t('designer.customTitle')}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ['body', t('designer.customBody')],
                    ['eye', t('designer.customEye')],
                    ['accent', t('designer.customAccent')],
                  ] as const
                ).map(([part, label]) => (
                  <ColorField
                    key={part}
                    part={part}
                    label={label}
                    value={customColors[part]}
                    disabled={disabled}
                    onChange={(p, hex) => change({ palette: 'custom', colors: { ...customColors, [p]: hex } })}
                  />
                ))}
              </div>
              {advice?.lowEyeContrast ? (
                <Notice tone="warning" size="compact">
                  {t('designer.lowContrast')}
                </Notice>
              ) : null}
              {advice?.faintOnLight ? (
                <Notice tone="info" size="compact">
                  {t('designer.faint')}
                </Notice>
              ) : null}
            </div>
          ) : null}
        </Section>

        <Section title={t('designer.eyes')}>
          <TileGroup
            label={t('designer.eyes')}
            value={spec.eyes}
            disabled={disabled}
            onChange={(eyes) => change({ eyes })}
            className="grid-cols-3 sm:grid-cols-6"
            options={AVATAR_EYES.map((eyes) => ({ value: eyes, label: labels.eyes(eyes), media: tile({ eyes, accessory: 'none' }) }))}
          />
        </Section>

        <Section title={t('designer.accessory')}>
          <TileGroup
            label={t('designer.accessory')}
            value={spec.accessory}
            disabled={disabled}
            onChange={(accessory) => change({ accessory })}
            className="grid-cols-3 sm:grid-cols-5"
            options={AVATAR_ACCESSORIES.map((accessory) => ({ value: accessory, label: labels.accessory(accessory), media: tile({ accessory }, 42) }))}
          />
        </Section>

        <Section title={t('designer.motion')}>
          <SegmentedControl
            aria-label={t('designer.motion')}
            value={spec.motion}
            onValueChange={(motion) => change({ motion })}
            options={AVATAR_MOTIONS.map((motion) => ({ value: motion, label: labels.motion(motion), disabled }))}
            className="self-start"
          />
          <p className="text-table text-fg-muted">{labels.motionHint(spec.motion)}</p>
        </Section>

        <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
          <Button variant="secondary" size="sm" icon={Dices} disabled={disabled} onClick={() => change(randomAvatar(spec))}>
            {t('designer.randomize')}
          </Button>
          <Button variant="ghost" size="sm" icon={RotateCcw} disabled={disabled} onClick={() => change({ ...DEFAULT_AVATAR, motion: spec.motion })}>
            {t('designer.reset')}
          </Button>
        </div>
      </div>
    </div>
  )
}
