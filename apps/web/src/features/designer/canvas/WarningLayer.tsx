/**
 * Avisos del despiece sobre el dibujo: un punto discreto en la esquina del paño afectado y un
 * resumen para los avisos generales. Al abrirlos se ve el mensaje en lenguaje de taller (en el
 * idioma de la interfaz, por código del motor vía el glosario) y, si existe, la corrección en un
 * clic. Nunca bloquean nada.
 */
import { useState } from 'react'
import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import type { Warning, WarningLevel, WindowDesign } from '@dekopen/engine'
import { cn } from '../../../lib/cn'
import { useGlossary, useT } from '../../../lib/i18n'
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/Popover'
import es from '../i18n/es'
import { undoLabel, type UndoLabel } from '../lib/undo'
import { worstLevel } from '../lib/warnings'

/** Corrección aplicada desde un aviso: el diseño, el texto del paso y su clave estable. */
export type WarningFix = (next: WindowDesign, label: string, undo?: UndoLabel) => void

const TONE: Record<WarningLevel, string> = {
  error: 'border-danger-line bg-danger-bg text-danger',
  warn: 'border-warning-line bg-warning-bg text-warning',
  info: 'border-divider-strong bg-raised text-fg-muted',
}

function LevelIcon({ level, className }: { level: WarningLevel; className?: string }) {
  const Icon = level === 'error' ? CircleAlert : level === 'warn' ? TriangleAlert : Info
  return <Icon aria-hidden strokeWidth={2} className={className} />
}

export function WarningList({ warnings, design, onFix }: { warnings: Warning[]; design: WindowDesign; onFix?: WarningFix }) {
  const g = useGlossary()
  return (
    <ul className="flex flex-col gap-3">
      {warnings.map((w, i) => {
        const fixLabel = w.fix ? (g.warningFix(w) ?? w.fix.label) : undefined
        return (
          <li key={`${w.code}-${i}`} className="flex gap-2.5">
            <LevelIcon level={w.level} className={cn('mt-0.5 size-4 shrink-0', w.level === 'error' ? 'text-danger' : w.level === 'warn' ? 'text-warning' : 'text-fg-muted')} />
            <div className="min-w-0">
              <p className="text-table text-fg">{g.warning(w)}</p>
              {w.fix && onFix && fixLabel ? (
                <button
                  type="button"
                  onClick={() => {
                    const step = undoLabel('fix', { label: fixLabel })
                    onFix({ ...design, ...w.fix!.patch }, step.label, step.undo)
                  }}
                  className="mt-1 rounded-xs text-table font-medium text-accent-ink underline-offset-2 hover:underline"
                >
                  {fixLabel}
                </button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function WarningMarkerButton({
  x,
  y,
  warnings,
  label,
  design,
  onFix,
  readOnly,
}: {
  x: number
  y: number
  warnings: Warning[]
  label: string
  design: WindowDesign
  onFix: WarningFix
  readOnly?: boolean
}) {
  const t = useT(es)
  const [open, setOpen] = useState(false)
  const level = worstLevel(warnings)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-canvas-ui=""
          aria-label={t('warnings.countIn', { count: warnings.length, target: label })}
          className={cn(
            'absolute z-10 inline-flex size-5 items-center justify-center rounded-full border shadow-xs',
            'transition-transform duration-100 ease-out hover:scale-110 touch:size-7',
            TONE[level],
          )}
          style={{ left: x - 10, top: y - 10 }}
        >
          <LevelIcon level={level} className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-72" data-canvas-ui="">
        <p className="mb-2 text-meta font-medium text-fg-muted">{label}</p>
        <WarningList
          warnings={warnings}
          design={design}
          onFix={
            readOnly
              ? undefined
              : (next, l, u) => {
                  onFix(next, l, u)
                  setOpen(false)
                }
          }
        />
      </PopoverContent>
    </Popover>
  )
}

export function WarningSummary({ warnings, design, onFix, readOnly }: { warnings: Warning[]; design: WindowDesign; onFix: WarningFix; readOnly?: boolean }) {
  const t = useT(es)
  const [open, setOpen] = useState(false)
  if (warnings.length === 0) return null
  const level = worstLevel(warnings)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-canvas-ui=""
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border px-2.5 text-table font-medium shadow-xs transition-colors duration-100 touch:h-10',
            level === 'error'
              ? 'border-danger-line bg-danger-bg text-danger'
              : level === 'warn'
                ? 'border-warning-line bg-warning-bg text-warning'
                : 'border-divider bg-raised text-fg-muted hover:bg-hover',
          )}
        >
          <LevelIcon level={level} className="size-3.5" />
          {t('warnings.count', { count: warnings.length })}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80" data-canvas-ui="">
        <p className="mb-2.5 text-meta font-medium text-fg-muted">{t('warnings.summaryTitle')}</p>
        <WarningList
          warnings={warnings}
          design={design}
          onFix={
            readOnly
              ? undefined
              : (next, l, u) => {
                  onFix(next, l, u)
                  setOpen(false)
                }
          }
        />
      </PopoverContent>
    </Popover>
  )
}
