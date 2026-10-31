/**
 * Panel de Marco: no modal, anclado abajo a la derecha en escritorio (no tapa el lienzo), acoplado en
 * la columna de ventanas del editor cuando la pantalla es angosta, y hoja inferior en el teléfono.
 * Se minimiza a una píldora con su cara y su estado.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link } from 'react-router'
import { ChevronUp, Minus, SquarePen, X } from 'lucide-react'
import { formatNumber } from '../../../lib/format'
import { cn } from '../../../lib/cn'
import { IconButton, Tooltip } from '../../../ui'
import { MARCO_STATE_LABELS, MarcoAvatar, type MarcoState } from '../avatar'
import type { ChatEntry } from '../types'
import { Composer, type ComposerHandle } from './Composer'
import { Conversation } from './Conversation'

export interface ModeInfo {
  mode: 'ai' | 'local' | null
  reason: string | null
  credits: number | null
}

const REASON_COPY: Record<string, string> = {
  plan: 'Tu plan usa el modo local: entiendo frases comunes sin IA. Marco con IA viene desde el plan Pro.',
  no_key: 'Por ahora trabajo sin IA: entiendo frases comunes como «agrega una corredera de 1500 x 1200».',
  no_credits: 'Se acabaron los créditos de IA de este período; sigo en modo local.',
  ai_error: 'La IA no respondió a tiempo; seguí en modo local.',
  offline: 'Sin conexión con el servidor: resolví aquí mismo, en este navegador.',
  forced: 'Modo local: entiendo frases comunes sin IA.',
}

export function ModeIndicator({ info }: { info: ModeInfo }) {
  if (!info.mode) return <span />
  if (info.mode === 'ai') {
    return (
      <Tooltip content="Créditos de IA que te quedan este período (1 crédito ≈ 1.000 palabras)">
        <span tabIndex={0} className="inline-flex items-center gap-1.5 rounded-xs text-[11.5px] text-paper-600 tabular outline-offset-2">
          <span aria-hidden className="size-1.5 rounded-full bg-ink-600" />
          IA{info.credits !== null ? ` · ${formatNumber(info.credits)} créditos` : ''}
        </span>
      </Tooltip>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-paper-600">
      <Tooltip content={REASON_COPY[info.reason ?? 'forced'] ?? REASON_COPY.forced}>
        <span tabIndex={0} className="inline-flex items-center gap-1.5 rounded-xs outline-offset-2">
          <span aria-hidden className="size-1.5 rounded-full border border-paper-350" />
          Modo local
        </span>
      </Tooltip>
      {info.reason === 'plan' && (
        <Link to="/ajustes/plan" className="font-medium text-ink-600 hover:text-ink-700 hover:underline">
          Ver Pro
        </Link>
      )}
    </span>
  )
}

export interface MarcoPanelProps {
  entries: ChatEntry[]
  draft: string
  busy: boolean
  /** Estado que se muestra (ya derivado: escuchando mientras escribes). */
  face: MarcoState
  statusText: string
  mode: ModeInfo
  suggestions: string[]
  mobile: boolean
  /** Acoplado en el lugar de la columna de ventanas del editor (bajo xl): ocupa todo su alto y ancho. */
  docked?: boolean
  /** Alto que el panel deja libre en escritorio (barra superior, márgenes y pie del editor). */
  reserve?: number
  greet: boolean
  onDraft(value: string): void
  onSend(text: string): void
  onStop(): void
  onUndo(receiptId: string): void
  onApproval(entryId: string, ok: boolean): void
  onMinimize(): void
  onClose(): void
  onReset(): void
  onFocusChange(focused: boolean): void
  onGreeted(): void
}

export function MarcoPanel(props: MarcoPanelProps) {
  const { entries, busy, face, mobile, docked = false } = props
  const composer = useRef<ComposerHandle>(null)
  const [inputEl, setInputEl] = useState<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    // Al abrir, el foco va a la entrada (sin desplazar la página).
    const id = requestAnimationFrame(() => {
      composer.current?.focus()
      setInputEl(composer.current?.element() ?? null)
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation()
      props.onMinimize()
    }
  }

  const empty = entries.length === 0
  const thinking = face === 'thinking'
  const lookAt = face === 'listening' && inputEl ? inputEl : 'pointer'

  return (
    <section
      role="complementary"
      aria-label="Marco, tu asistente"
      onKeyDown={onKeyDown}
      data-docked={docked ? '' : undefined}
      className={cn(
        '@container pointer-events-auto flex flex-col overflow-hidden bg-paper-0 text-paper-900',
        mobile
          ? 'h-[min(88dvh,760px)] w-full rounded-t-[16px] border-t border-paper-200 shadow-[0_-8px_32px_rgb(31_28_24/0.12)]'
          : docked
            ? 'h-full w-full border-r border-paper-200 shadow-[1px_0_0_rgb(31_28_24/0.02),8px_0_24px_-12px_rgb(31_28_24/0.10)]'
            : 'w-[368px] rounded-[14px] border border-paper-200 shadow-pop',
      )}
      style={mobile || docked ? undefined : { height: `min(640px, calc(100dvh - ${props.reserve ?? 76}px))` }}
    >
      {mobile && (
        <button type="button" onClick={props.onMinimize} aria-label="Minimizar a Marco" className="mx-auto mt-2 block h-1.5 w-10 shrink-0 rounded-full bg-paper-200" />
      )}
      <header className={cn('flex shrink-0 items-center gap-2.5 border-b border-paper-200 pr-2 pl-3', mobile ? 'h-14' : 'h-[58px]')}>
        <MarcoAvatar state={face} size={34} title="Marco" lookAt={lookAt} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-5 font-semibold tracking-[-0.01em]">Marco</p>
          <p className="truncate text-[12px] leading-4 text-paper-600" aria-live="polite">
            {props.statusText}
          </p>
        </div>
        <IconButton icon={SquarePen} label="Nueva conversación" size="sm" onClick={props.onReset} disabled={empty && !busy} tooltipSide="bottom" />
        <IconButton icon={Minus} label="Minimizar" shortcut="esc" size="sm" onClick={props.onMinimize} tooltipSide="bottom" />
        <IconButton icon={X} label="Cerrar" shortcut="mod+j" size="sm" onClick={props.onClose} tooltipSide="bottom" />
      </header>

      {empty ? (
        <EmptyGreeting greet={props.greet} onGreeted={props.onGreeted} suggestions={props.suggestions} onPick={props.onSend} compact={docked} />
      ) : (
        <Conversation entries={entries} thinking={thinking} onUndo={props.onUndo} onApproval={props.onApproval} onNavigate={mobile ? props.onMinimize : undefined} />
      )}

      {!empty && !busy && props.suggestions.length > 0 && (
        <div className="scrollbar-quiet flex shrink-0 gap-1.5 overflow-x-auto px-3 pt-2 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
          {props.suggestions.slice(0, 3).map((s) => (
            <SuggestionChip key={s} text={s} onPick={props.onSend} compact />
          ))}
        </div>
      )}

      <Composer
        ref={composer}
        value={props.draft}
        onChange={props.onDraft}
        onSubmit={props.onSend}
        onStop={props.onStop}
        busy={busy}
        onFocusChange={props.onFocusChange}
        footer={
          <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
            <span className={cn('hidden text-[11.5px] text-paper-600', !docked && 'sm:inline')}>Enter envía · Shift+Enter, otra línea</span>
            <ModeIndicator info={props.mode} />
          </div>
        }
      />
    </section>
  )
}

function SuggestionChip({ text, onPick, compact }: { text: string; onPick(text: string): void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onPick(text)}
      className={cn(
        'shrink-0 rounded-full border border-paper-200 bg-paper-0 text-left text-paper-900 transition-[background-color,border-color] duration-120 hover:border-paper-350/60 hover:bg-paper-50',
        compact ? 'h-7 px-3 text-[12.5px] whitespace-nowrap' : 'min-h-8 px-3.5 py-1.5 text-[13px] leading-[18px]',
      )}
    >
      {text}
    </button>
  )
}

function EmptyGreeting({
  greet,
  onGreeted,
  suggestions,
  onPick,
  compact,
}: {
  greet: boolean
  onGreeted(): void
  suggestions: string[]
  onPick(text: string): void
  compact?: boolean
}) {
  const [state, setState] = useState<MarcoState>(greet ? 'done' : 'idle')
  useEffect(() => {
    if (!greet) return
    onGreeted()
    const timer = setTimeout(() => setState('idle'), 2600)
    return () => clearTimeout(timer)
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className={cn('scrollbar-quiet flex min-h-0 flex-1 flex-col overflow-y-auto pb-3', compact ? 'px-4 pt-5' : 'px-5 pt-7')}>
      <MarcoAvatar state={state} size={compact ? 60 : 72} />
      <h2 className="mt-4 text-[20px] leading-7 font-semibold tracking-[-0.01em]">Hola, soy Marco.</h2>
      <p className="mt-1 max-w-[300px] text-[14px] leading-[21px] text-paper-600">
        Te ayudo a armar cotizaciones y a moverte por tus obras. Dime qué necesitas, como se lo dirías a alguien del taller.
      </p>
      <p className="mt-6 mb-2 text-[12px] font-medium text-paper-600">Prueba con</p>
      <div className="flex flex-col items-start gap-1.5">
        {suggestions.map((s) => (
          <SuggestionChip key={s} text={s} onPick={onPick} />
        ))}
      </div>
    </div>
  )
}

/** Píldora minimizada: la cara de Marco, su estado y lo último que dijo. */
export function MarcoMinimized({
  face,
  statusText,
  preview,
  onExpand,
  onClose,
  mobile,
}: {
  face: MarcoState
  statusText: string
  preview: string
  onExpand(): void
  onClose(): void
  mobile: boolean
}) {
  if (mobile) {
    // En el teléfono, solo su cara: no tapa la barra de totales ni la navegación.
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-label={`Abrir el panel de Marco · ${preview || statusText}`}
        className="pointer-events-auto inline-flex size-14 items-center justify-center rounded-full border border-paper-200 bg-paper-0 shadow-float transition-transform duration-120 active:scale-[0.96]"
      >
        <MarcoAvatar state={face} size={40} />
      </button>
    )
  }
  return (
    <div className="pointer-events-auto flex h-12 max-w-[340px] items-center gap-1 rounded-full border border-paper-200 bg-paper-0 pr-1.5 pl-1.5 shadow-float">
      <button type="button" onClick={onExpand} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-1 pr-2 text-left outline-offset-2" aria-label="Abrir el panel de Marco">
        <MarcoAvatar state={face} size={34} />
        <span className="min-w-0">
          <span className="block text-[13px] leading-4 font-semibold">Marco</span>
          <span className="block max-w-[220px] truncate text-[12px] leading-4 text-paper-600" aria-live="polite">
            {preview || statusText}
          </span>
        </span>
      </button>
      <IconButton icon={ChevronUp} label="Abrir" size="sm" onClick={onExpand} tooltip={false} />
      <IconButton icon={X} label="Cerrar a Marco" size="sm" onClick={onClose} tooltip={false} />
    </div>
  )
}

export function statusLine(face: MarcoState, entries: readonly ChatEntry[]): string {
  if (face === 'working') {
    const last = entries[entries.length - 1]
    const step = last?.steps?.filter((s) => !s.done).at(-1) ?? last?.steps?.at(-1)
    if (step) return step.label
    return 'Trabajando en tu cotización…'
  }
  if (face === 'approval') return 'Esperando tu visto bueno'
  return MARCO_STATE_LABELS[face]
}
