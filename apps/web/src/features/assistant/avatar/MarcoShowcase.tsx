/*
 * /dev/marco — vitrina de los avatares de los asistentes: diseñador, estados, formas, paletas,
 * ojos con expresiones, accesorios, tamaños y los dos temas lado a lado. Sin sesión ni servidor.
 * (Se mantiene el nombre del archivo: la ruta de desarrollo lo importa así.)
 */
import {
  AVATAR_ACCESSORIES,
  AVATAR_EYES,
  AVATAR_PALETTE_IDS,
  AVATAR_SHAPES,
  normalizeAvatarSpec,
  type AvatarShape,
  type AvatarSpec,
} from '@dekopen/shared'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { SegmentedControl } from '../../../ui'
import { AssistantAvatar } from './AssistantAvatar'
import { AvatarDesigner } from './AvatarDesigner'
import { AVATAR_STATES, type AvatarState } from './engine/director'
import type { ExpressionId } from './engine/expressions'
import { useAvatarLabels } from './labels'
import es from './i18n/es'

type MotionChoice = 'system' | 'full' | 'reduced'

/** Estados con secuencia que terminan solos: en la vitrina se repiten. */
const ONE_SHOT: ReadonlySet<AvatarState> = new Set(['done', 'alert', 'celebrate', 'swirl'])
const EXPRESSION_SAMPLE: ExpressionId[] = ['attentive', 'happy', 'laughing', 'surprised', 'curious', 'worried', 'sad', 'sleepy']
const SIZES = [16, 20, 24, 28, 34, 40, 56, 96, 160] as const
const ACCESSORY_SHAPES: AvatarShape[] = ['circle', 'window', 'triangle']

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="border-t border-divider py-10">
      <h2 id={id} className="text-h3 text-fg-strong">
        {title}
      </h2>
      {hint ? <p className="mt-1 max-w-[64ch] text-table text-fg-muted">{hint}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  )
}

/** Repite un estado de una sola vez (listo, alerta…) para poder mirarlo con calma. */
function useLoopedState(state: AvatarState): AvatarState {
  const [phase, setPhase] = useState<'on' | 'rest'>('on')
  useEffect(() => {
    if (!ONE_SHOT.has(state)) return
    const timer = window.setTimeout(() => setPhase((p) => (p === 'on' ? 'rest' : 'on')), phase === 'on' ? 3600 : 900)
    return () => window.clearTimeout(timer)
  }, [state, phase])
  return ONE_SHOT.has(state) && phase === 'rest' ? 'idle' : state
}

function StateCard({ spec, state, reduced }: { spec: AvatarSpec; state: AvatarState; reduced?: boolean }) {
  const labels = useAvatarLabels()
  const shown = useLoopedState(state)
  return (
    <figure className="flex flex-col items-center gap-3 rounded-panel border border-divider bg-surface px-3 pb-4 pt-6">
      <AssistantAvatar spec={spec} state={shown} size={88} reducedMotion={reduced} title={labels.state(state)} />
      <figcaption className="text-center">
        <span className="block text-table font-medium text-fg-strong">{labels.stateName(state)}</span>
        <span className="block text-meta text-fg-muted">{labels.state(state)}</span>
      </figcaption>
    </figure>
  )
}

export default function MarcoShowcase() {
  const t = useT(es)
  const labels = useAvatarLabels()
  const [spec, setSpec] = useState<AvatarSpec>(() => normalizeAvatarSpec({ shape: 'window', palette: 'anthracite', eyes: 'capsule', accessory: 'none', motion: 'calm' }))
  const [motion, setMotion] = useState<MotionChoice>('system')
  const reduced = motion === 'system' ? undefined : motion === 'reduced'

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        <header className="flex flex-wrap items-end justify-between gap-6 pb-8">
          <div>
            <h1 className="text-h1 text-fg-strong">{t('showcase.title')}</h1>
            <p className="mt-1 max-w-[60ch] text-fg-muted">{t('showcase.lead')}</p>
          </div>
          <SegmentedControl
            aria-label={t('showcase.motionSystem')}
            value={motion}
            onValueChange={setMotion}
            size="sm"
            options={[
              { value: 'system', label: t('showcase.motionSystem') },
              { value: 'full', label: t('showcase.motionFull') },
              { value: 'reduced', label: t('showcase.motionReduced') },
            ]}
          />
        </header>

        <Section title={t('showcase.designer')}>
          <div className="rounded-dialog border border-divider bg-surface p-5 shadow-xs">
            <AvatarDesigner value={spec} onChange={setSpec} name="Marco" />
          </div>
        </Section>

        <Section title={t('showcase.states')} hint={t('showcase.statesHint')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {AVATAR_STATES.map((state) => (
              <StateCard key={state} spec={spec} state={state} reduced={reduced} />
            ))}
          </div>
        </Section>

        <Section title={t('showcase.shapes')}>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {AVATAR_SHAPES.map((shape) => (
              <figure key={shape} className="flex flex-col items-center gap-2 rounded-panel border border-divider bg-surface py-5">
                <AssistantAvatar spec={{ ...spec, shape }} size={72} reducedMotion={reduced} />
                <figcaption className="text-table text-fg-muted">{labels.shape(shape)}</figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section title={t('showcase.palettes')}>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {AVATAR_PALETTE_IDS.map((palette) => (
              <figure key={palette} className="flex flex-col items-center gap-2 rounded-panel border border-divider bg-surface py-5">
                <AssistantAvatar spec={{ ...spec, palette }} size={56} animated={false} />
                <figcaption className="text-table text-fg-muted">{labels.palette(palette)}</figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section title={t('showcase.eyesTitle')}>
          <div className="overflow-x-auto rounded-panel border border-divider bg-surface">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="bg-sunken text-meta text-fg-muted">
                  <th className="px-3 py-2 text-left font-medium" />
                  {EXPRESSION_SAMPLE.map((e) => (
                    <th key={e} className="px-2 py-2 text-center font-medium">
                      {t(`expression.${e}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AVATAR_EYES.map((eyes) => (
                  <tr key={eyes} className="border-t border-divider">
                    <th className="px-3 py-2 text-left text-table font-medium text-fg">{labels.eyes(eyes)}</th>
                    {EXPRESSION_SAMPLE.map((e) => (
                      <td key={e} className="px-2 py-2 text-center">
                        <AssistantAvatar spec={{ ...spec, eyes, accessory: 'none' }} expression={e} size={48} animated={false} className="mx-auto" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={t('showcase.accessories')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {AVATAR_ACCESSORIES.map((accessory) => (
              <figure key={accessory} className="flex flex-col items-center gap-3 rounded-panel border border-divider bg-surface px-2 py-5">
                <div className="flex items-end gap-2">
                  {ACCESSORY_SHAPES.map((shape) => (
                    <AssistantAvatar key={shape} spec={{ ...spec, shape, accessory }} size={52} animated={false} />
                  ))}
                </div>
                <figcaption className="text-table text-fg-muted">{labels.accessory(accessory)}</figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section title={t('showcase.sizes')}>
          <div className="grid gap-3 md:grid-cols-2">
            {(['light', 'dark'] as const).map((theme) => (
              <div key={theme} data-theme={theme} className="rounded-panel border border-divider bg-surface p-5 text-fg">
                <p className="mb-4 text-meta text-fg-muted">{theme === 'light' ? t('showcase.themeLight') : t('showcase.themeDark')}</p>
                <div className="flex flex-wrap items-end gap-4">
                  {SIZES.map((size) => (
                    <div key={size} className="flex flex-col items-center gap-1.5">
                      <AssistantAvatar spec={spec} size={size} reducedMotion={reduced} />
                      <span className={cn('code-id text-micro text-fg-faint')}>{size}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  {AVATAR_PALETTE_IDS.map((palette) => (
                    <AssistantAvatar key={palette} spec={{ ...spec, palette }} size={34} animated={false} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
