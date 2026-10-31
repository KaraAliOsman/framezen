/**
 * Avisos del despiece sobre el dibujo: un punto discreto en la esquina del paño afectado y un
 * resumen para los avisos generales. Al abrirlos se ve el mensaje en lenguaje de taller y, si
 * existe, la corrección en un clic. Nunca bloquean nada.
 */
import { useState } from 'react'
import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import type { Warning, WarningLevel, WindowDesign } from '@framezen/engine'
import { cn } from '../../../lib/cn'
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/Popover'
import { warningCountLabel, worstLevel } from '../lib/warnings'

const TONE: Record<WarningLevel, string> = {
  error: 'border-bad-600/40 bg-bad-50 text-bad-600',
  warn: 'border-warn-600/40 bg-warn-50 text-warn-600',
  info: 'border-paper-200 bg-paper-0 text-paper-600',
}

function LevelIcon({ level, className }: { level: WarningLevel; className?: string }) {
  const Icon = level === 'error' ? CircleAlert : level === 'warn' ? TriangleAlert : Info
  return <Icon aria-hidden strokeWidth={2} className={className} />
}

export function WarningList({ warnings, design, onFix }: { warnings: Warning[]; design: WindowDesign; onFix?: (next: WindowDesign, label: string) => void }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {warnings.map((w, i) => (
        <li key={`${w.code}-${i}`} className="flex gap-2.5">
          <LevelIcon
            level={w.level}
            className={cn('mt-0.5 size-4 shrink-0', w.level === 'error' ? 'text-bad-600' : w.level === 'warn' ? 'text-warn-600' : 'text-paper-600')}
          />
          <div className="min-w-0">
            <p className="text-[13px] leading-[18px] text-paper-900">{w.message}</p>
            {w.fix && onFix ? (
              <button
                type="button"
                onClick={() => onFix({ ...design, ...w.fix!.patch }, w.fix!.label)}
                className="mt-1 rounded-xs text-[13px] font-medium text-ink-600 underline-offset-2 hover:underline focus-visible:shadow-[0_0_0_2px_var(--ink-500)] focus-visible:outline-none"
              >
                {w.fix.label}
              </button>
            ) : null}
          </div>
        </li>
      ))}
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
  onFix: (next: WindowDesign, label: string) => void
  readOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const level = worstLevel(warnings)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-canvas-ui=""
          aria-label={`${warningCountLabel(warnings.length)} en ${label}`}
          className={cn(
            'absolute z-10 inline-flex size-5 items-center justify-center rounded-full border shadow-[0_1px_2px_rgb(31_28_24/0.08)]',
            'transition-transform duration-120 ease-out hover:scale-110 focus-visible:shadow-[0_0_0_2px_var(--paper-0),0_0_0_4px_var(--ink-500)] focus-visible:outline-none touch:size-7',
            TONE[level],
          )}
          style={{ left: x - 10, top: y - 10 }}
        >
          <LevelIcon level={level} className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-72" data-canvas-ui="">
        <p className="mb-2 text-meta font-medium text-paper-600">{label}</p>
        <WarningList warnings={warnings} design={design} onFix={readOnly ? undefined : (next, l) => { onFix(next, l); setOpen(false) }} />
      </PopoverContent>
    </Popover>
  )
}

export function WarningSummary({ warnings, design, onFix, readOnly }: { warnings: Warning[]; design: WindowDesign; onFix: (next: WindowDesign, label: string) => void; readOnly?: boolean }) {
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
            'inline-flex h-8 items-center gap-1.5 rounded-sm border bg-paper-0 px-2.5 text-[13px] font-medium shadow-[0_1px_2px_rgb(31_28_24/0.06)] transition-colors duration-120 touch:h-10',
            'focus-visible:shadow-[0_0_0_2px_var(--ink-500)] focus-visible:outline-none',
            level === 'error' ? 'border-bad-600/30 text-bad-800 hover:bg-bad-50' : level === 'warn' ? 'border-warn-600/30 text-warn-800 hover:bg-warn-50' : 'border-paper-200 text-paper-600 hover:bg-paper-100',
          )}
        >
          <LevelIcon level={level} className="size-3.5" />
          {warningCountLabel(warnings.length)}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80" data-canvas-ui="">
        <p className="mb-2 text-meta font-medium text-paper-600">Avisos de la ventana · no impiden cotizar</p>
        <WarningList warnings={warnings} design={design} onFix={readOnly ? undefined : (next, l) => { onFix(next, l); setOpen(false) }} />
      </PopoverContent>
    </Popover>
  )
}
