/**
 * Editor de cota en el lugar: aparece sobre la cifra, acepta «1200», «1.200», «2400/2» y, en las
 * cotas totales, «1500x1200». Enter aplica, Esc cancela, salir del campo aplica si se entiende.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '../../../lib/cn'
import { measureDraft, parseMeasureExpression, parseSizeExpression } from '../lib/measure'

export interface DimensionEditorProps {
  /** Centro de la cifra en coordenadas del lienzo (px). */
  x: number
  y: number
  value: number
  label: string
  /** Cota total: acepta ancho × alto. */
  allowPair?: boolean
  onCommit: (value: number) => void
  onCommitPair?: (size: { width: number; height: number }) => void
  onCancel: () => void
  container: { width: number; height: number }
}

export function DimensionEditor({ x, y, value, label, allowPair, onCommit, onCommitPair, onCancel, container }: DimensionEditorProps) {
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => measureDraft(value))
  const [invalid, setInvalid] = useState(false)
  const done = useRef(false)
  const hintId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.select()
  }, [])

  const commit = (): boolean => {
    if (done.current) return true
    const raw = text.trim()
    if (!raw || raw === measureDraft(value)) {
      done.current = true
      onCancel()
      return true
    }
    if (allowPair && onCommitPair) {
      const pair = parseSizeExpression(raw)
      if (pair) {
        done.current = true
        onCommitPair(pair)
        return true
      }
    }
    const n = parseMeasureExpression(raw)
    if (n === null || n <= 0) {
      setInvalid(true)
      return false
    }
    done.current = true
    onCommit(n)
    return true
  }

  const width = 112
  const height = 32
  const left = Math.min(Math.max(8, x - width / 2), Math.max(8, container.width - width - 8))
  const top = Math.min(Math.max(8, y - height / 2), Math.max(8, container.height - height - 28))

  return (
    <div data-canvas-ui="" className="absolute z-20" style={{ left, top, width }}>
      <div
        className={cn(
          'relative flex h-8 items-center rounded-sm border bg-paper-0 shadow-float transition-[border-color,box-shadow] duration-120',
          invalid ? 'border-bad-600 shadow-[0_0_0_3px_var(--bad-50)]' : 'border-ink-500 shadow-[0_0_0_3px_var(--ink-100)]',
        )}
      >
        <input
          ref={ref}
          value={text}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value)
            if (invalid) setInvalid(false)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              done.current = true
              onCancel()
            }
          }}
          onBlur={() => {
            if (!commit()) {
              done.current = true
              onCancel()
            }
          }}
          className="h-full w-full rounded-sm bg-transparent pr-9 pl-2.5 text-center text-[14px] font-medium tabular text-paper-900 outline-none touch:text-lead"
        />
        <span aria-hidden className="pointer-events-none absolute right-2.5 text-[12px] text-paper-600">
          mm
        </span>
      </div>
      <p
        id={hintId}
        className={cn(
          'mt-1 w-max max-w-56 rounded-xs px-1.5 py-0.5 text-[11px] leading-4',
          invalid ? 'bg-bad-50 text-bad-800' : 'bg-paper-900/85 text-paper-0',
        )}
      >
        {invalid ? 'Escribe una medida, como 1200 o 2400/2' : allowPair ? 'Enter aplica · admite 2400/2 o 1500x1200' : 'Enter aplica · Esc cancela'}
      </p>
    </div>
  )
}
