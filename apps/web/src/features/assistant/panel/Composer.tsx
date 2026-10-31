/**
 * Entrada del panel: textarea que crece de 1 a 6 líneas, Enter envía y Shift+Enter salta de línea,
 * dictado por voz si el navegador lo permite, y «Detener» mientras Marco trabaja. Nunca se
 * deshabilita mientras responde.
 */
import { forwardRef, useImperativeHandle, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUp, Mic, Square } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { Tooltip } from '../../../ui'
import { useDictation } from '../useDictation'

export interface ComposerHandle {
  focus(): void
  element(): HTMLTextAreaElement | null
}

export interface ComposerProps {
  value: string
  onChange(value: string): void
  onSubmit(value: string): void
  onStop(): void
  busy: boolean
  onFocusChange?(focused: boolean): void
  placeholder?: string
  footer?: ReactNode
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { value, onChange, onSubmit, onStop, busy, onFocusChange, placeholder = 'Pídeme algo o pega medidas (ej. 1500 x 1200 corredera)', footer },
  ref,
) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value
  useImperativeHandle(ref, () => ({ focus: () => textarea.current?.focus(), element: () => textarea.current }), [])

  const dictation = useDictation({
    onFinal: (text) => {
      if (!text) return
      const current = valueRef.current
      onChange(current ? `${current.replace(/\s+$/, '')} ${text}` : text)
      textarea.current?.focus()
    },
  })

  const submit = () => {
    const text = value.trim()
    if (text) onSubmit(text)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  const shown = dictation.listening && dictation.interim ? `${value ? `${value} ` : ''}${dictation.interim}` : value
  const canSend = value.trim().length > 0

  return (
    <div className="shrink-0 px-3 pt-2 pb-3">
      <div
        className={cn(
          'flex items-end gap-1 rounded-[12px] border bg-paper-0 py-1 pr-1 pl-3 transition-[border-color,box-shadow] duration-120',
          'border-paper-350/55 focus-within:border-ink-500 focus-within:shadow-[0_0_0_3px_var(--ink-50)]',
          dictation.listening && 'border-ink-500 shadow-[0_0_0_3px_var(--ink-50)]',
        )}
      >
        <label htmlFor="marco-input" className="sr-only">
          Mensaje para Marco
        </label>
        <textarea
          id="marco-input"
          ref={textarea}
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          rows={1}
          placeholder={dictation.listening ? 'Te escucho…' : placeholder}
          enterKeyHint="send"
          autoComplete="off"
          spellCheck
          className="scrollbar-quiet max-h-[132px] min-h-[30px] flex-1 resize-none self-center bg-transparent py-[5px] text-[14px] leading-[20px] text-paper-900 outline-none [field-sizing:content] placeholder:text-paper-600/80 focus-visible:outline-none touch:text-[16px]"
        />
        {dictation.supported && (
          <Tooltip content={dictation.listening ? 'Dejar de dictar' : 'Dictar por voz'}>
            <button
              type="button"
              onClick={dictation.listening ? dictation.stop : dictation.start}
              aria-label={dictation.listening ? 'Dejar de dictar' : 'Dictar por voz'}
              aria-pressed={dictation.listening}
              className={cn(
                'inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] transition-colors duration-120 touch:size-10',
                dictation.listening ? 'bg-ink-50 text-ink-600' : 'text-paper-600 hover:bg-paper-100 hover:text-paper-900',
              )}
            >
              <Mic aria-hidden strokeWidth={1.75} className="size-[18px]" />
            </button>
          </Tooltip>
        )}
        {busy ? (
          <Tooltip content="Detener">
            <button
              type="button"
              onClick={onStop}
              aria-label="Detener"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-paper-900 text-paper-0 transition-[background-color,transform] duration-120 hover:bg-paper-900/85 active:scale-[0.96] touch:size-10"
            >
              <Square aria-hidden strokeWidth={0} fill="currentColor" className="size-3" />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Enviar"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-ink-600 text-paper-0 transition-[background-color,transform,opacity] duration-120 hover:bg-ink-700 active:scale-[0.96] disabled:pointer-events-none disabled:bg-paper-200 disabled:text-paper-600 touch:size-10"
          >
            <ArrowUp aria-hidden strokeWidth={2} className="size-[18px]" />
          </button>
        )}
      </div>
      {dictation.problem ? (
        <p role="status" className="mt-1.5 px-1 text-[12px] text-warn-800">
          {dictation.problem}
        </p>
      ) : (
        footer
      )}
    </div>
  )
})
