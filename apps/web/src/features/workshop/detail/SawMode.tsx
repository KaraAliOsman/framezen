/**
 * Modo sierra: la tablet junto a la máquina. Una pieza a la vez, con la medida enorme, sus ángulos, de
 * qué ventana es y si hay que mover el tope. «Cortada» avanza; las marcas son las mismas de la lista.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { Bar, Catalog, CutSettings, OptimizationGroup } from '@dekopen/engine'
import { barGeometry, workshopSideWords, type BarPieceId } from '@dekopen/documents'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { Button, IconButton } from '../../../ui'
import es from '../i18n/es'

export interface SawStep {
  groupIndex: number
  barIndex: number
  pieceIndex: number
  group: OptimizationGroup
  bar: Bar
  barKey: string
  key: string
  id?: BarPieceId
  sameStop: boolean
}

/** Todas las piezas de la OT, en orden de corte. */
export function sawSteps(groups: readonly OptimizationGroup[], ids: ReadonlyMap<string, (BarPieceId | undefined)[][]>, barKeyOf: (group: OptimizationGroup, index: number, bar: Bar) => string): SawStep[] {
  const steps: SawStep[] = []
  groups.forEach((group, groupIndex) => {
    let previous: number | null = null
    group.bars.forEach((bar, barIndex) => {
      const barKey = barKeyOf(group, barIndex, bar)
      bar.cuts.forEach((cut, pieceIndex) => {
        steps.push({ groupIndex, barIndex, pieceIndex, group, bar, barKey, key: `${barKey}|${pieceIndex + 1}`, id: ids.get(group.key)?.[barIndex]?.[pieceIndex], sameStop: previous === cut.length })
        previous = cut.length
      })
    })
  })
  return steps
}

export function SawMode({
  open,
  onOpenChange,
  steps,
  catalog,
  cut,
  isDone,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  steps: SawStep[]
  catalog?: Catalog
  cut: CutSettings
  isDone: (key: string) => boolean
  /** Marca o desmarca piezas (y su barra cuando se completa). */
  onDone: (keys: string[], done: boolean) => void
}) {
  const t = useT(es)
  const firstOpen = useMemo(() => Math.max(0, steps.findIndex((s) => !isDone(s.key) && !isDone(s.barKey))), [steps, isDone])
  const [index, setIndex] = useState(firstOpen)
  useEffect(() => {
    if (open) setIndex(firstOpen)
    // Solo al abrir: después manda el avance del operador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const step = steps[Math.min(index, steps.length - 1)]

  const advance = useCallback(() => {
    if (!step) return
    const others = steps.filter((s) => s.barKey === step.barKey && s.key !== step.key)
    const barDone = others.every((s) => isDone(s.key))
    onDone(barDone ? [step.key, step.barKey] : [step.key], true)
    setIndex((i) => Math.min(steps.length, i + 1))
  }, [step, steps, isDone, onDone])
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        if (index < steps.length) advance()
      } else if (event.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, advance, back, index, steps.length])

  const finished = index >= steps.length
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-50 flex flex-col bg-canvas">
          <Dialog.Title className="sr-only">{t('sawMode.title')}</Dialog.Title>
        {step && !finished ? <StepView step={step} index={index} total={steps.length} catalog={catalog} cut={cut} next={steps[index + 1]} isDone={isDone} onClose={() => onOpenChange(false)} /> : <Finished total={steps.length} onClose={() => onOpenChange(false)} onBack={back} />}
        {!finished ? (
          <footer className="flex items-stretch gap-3 border-t border-divider p-4">
            <Button size="lg" icon={ArrowLeft} onClick={back} disabled={index === 0} className="h-16 px-6">
              {t('sawMode.back')}
            </Button>
            <Button size="lg" variant="primary" icon={Check} onClick={advance} className="h-16 flex-1 text-h3">
              {t('sawMode.cut')}
            </Button>
          </footer>
        ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Finished({ total, onClose, onBack }: { total: number; onClose: () => void; onBack: () => void }) {
  const t = useT(es)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="figure text-display font-medium text-fg-strong">{total}</p>
      <p className="text-h3 text-fg">{t('sawMode.finished')}</p>
      <div className="flex gap-2">
        <Button size="lg" icon={ArrowLeft} onClick={onBack}>
          {t('sawMode.back')}
        </Button>
        <Button size="lg" variant="primary" onClick={onClose}>
          {t('sawMode.close')}
        </Button>
      </div>
    </div>
  )
}

function StepView({ step, index, total, catalog, cut, next, isDone, onClose }: { step: SawStep; index: number; total: number; catalog?: Catalog; cut: CutSettings; next?: SawStep; isDone: (key: string) => boolean; onClose: () => void }) {
  const t = useT(es)
  const fmt = useFormat()
  const piece = step.bar.cuts[step.pieceIndex]!
  const color = step.group.colorId ? catalog?.colors.find((c) => c.id === step.group.colorId)?.name : undefined
  const measure = (value: number) => fmt.number(Math.round(value * 10) / 10, { maxDecimals: 1 })
  const angle = (a: number | undefined) => `${fmt.number(a ?? 90, { maxDecimals: 1 })}°`
  const geo = barGeometry(step.bar, cut)
  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-divider px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-lead font-medium text-fg-strong">
            <span className="code-id mr-2 font-normal text-fg-muted">{step.group.code}</span>
            {step.group.name}
            {color ? <span className="font-normal text-fg-muted"> · {color}</span> : null}
          </p>
          <p className="text-table text-fg-muted tabular">
            {t('sawMode.barOf', { n: step.barIndex + 1, total: step.group.bars.length })} · {t('sawMode.pieceOf', { n: step.pieceIndex + 1, total: step.bar.cuts.length })} · {t('sawMode.saw', { kerf: measure(geo.kerf), start: measure(geo.trimStart), end: measure(geo.trimEnd) })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-table text-fg-muted tabular">{t('sawMode.step', { n: index + 1, total })}</span>
          <IconButton icon={X} label={t('sawMode.close')} onClick={onClose} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-auto px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div>
            <p className="figure text-[clamp(96px,17vw,220px)] leading-[0.9] font-medium tracking-tight text-fg-strong">{measure(piece.length)}</p>
            <p className="mt-2 text-h3 text-fg-muted">{step.sameStop ? t('sawMode.sameStop') : t('sawMode.moveStop')}</p>
          </div>
          <div className="min-w-0 text-right">
            <PieceShape start={piece.angleStart ?? 90} end={piece.angleEnd ?? 90} label={`${angle(piece.angleStart)} · ${angle(piece.angleEnd)}`} />
            <p className="mt-3 text-[clamp(32px,4.4vw,56px)] leading-none font-medium text-fg-strong">{step.id?.code ?? piece.ref ?? ''}</p>
            <p className="mt-2 text-h3 text-fg">
              {workshopSideWords(step.id?.side ?? piece.label)}
              {step.id && step.id.units > 1 ? <span className="text-fg-muted"> · {t('sawMode.unit', { n: step.id.unit, total: step.id.units })}</span> : null}
            </p>
          </div>
        </div>
        <BarStrip step={step} isDone={isDone} cut={cut} />
        {next ? (
          <p className="text-lead text-fg-muted tabular">
            {t('sawMode.next')}: <span className="font-medium text-fg">{measure(next.bar.cuts[next.pieceIndex]!.length)}</span> {next.id?.code ?? ''}
          </p>
        ) : null}
      </div>
    </>
  )
}

/** Silueta grande del corte: la cara larga abajo. */
function PieceShape({ start, end, label }: { start: number; end: number; label: string }) {
  const W = 300
  const H = 74
  const off = (a: number) => (a >= 89.95 || a <= 0.5 ? 0 : Math.min(H / Math.tan((a * Math.PI) / 180), W * 0.36))
  return (
    <figure className="m-0 inline-flex flex-col items-end gap-1">
      <svg width={W} height={H} viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="max-w-full" role="img" aria-label={label}>
        <polygon points={`${off(start)},0 ${W - off(end)},0 ${W},${H} 0,${H}`} fill="var(--dk-surface)" stroke="var(--dk-fg-strong)" strokeWidth={2.5} strokeLinejoin="miter" />
      </svg>
      <figcaption className="text-h3 font-medium text-fg-strong tabular">{label}</figcaption>
    </figure>
  )
}

/** La barra completa a escala: lo cortado, lo que se corta ahora y lo que falta. */
function BarStrip({ step, isDone, cut }: { step: SawStep; isDone: (key: string) => boolean; cut: CutSettings }) {
  const { bar } = step
  const pct = (mm: number) => `${(mm / bar.barLength) * 100}%`
  const geo = barGeometry(bar, cut)
  return (
    <div className="relative h-14 overflow-hidden rounded-xs bg-hover" aria-hidden>
      {bar.cuts.map((c, i) => {
        const current = i === step.pieceIndex
        const done = isDone(`${step.barKey}|${i + 1}`) || i < step.pieceIndex
        return <div key={i} className={cn('absolute inset-y-0 border-x-2 border-canvas', current ? 'bg-[var(--dk-select)]' : done ? 'bg-pressed' : 'bg-accent')} style={{ left: pct(c.offset), width: pct(c.length) }} />
      })}
      {geo.remainder > 0 ? <div className="absolute inset-y-0 border-2 border-dashed border-control" style={{ left: pct(geo.remainderStart), width: pct(geo.remainder) }} /> : null}
    </div>
  )
}

