/**
 * Editor de cota en el lugar: aparece sobre la cifra, acepta «1200», «1.200», «2400/2» y, en las
 * cotas totales, «1500x1200». Enter aplica, Esc cancela, salir del campo aplica si se entiende.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '../../../lib/cn'
import { useLocale, useT } from '../../../lib/i18n'
import es from '../i18n/es'
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
  const t = useT(es)
  const { locale } = useLocale()
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => measureDraft(value, locale))
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
    if (!raw || raw === measureDraft(value, locale)) {
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

  const width = 120
  const height = 32
  const left = Math.min(Math.max(8, x - width / 2), Math.max(8, container.width - width - 8))
  const top = Math.min(Math.max(8, y - height / 2), Math.max(8, container.height - height - 28))

  return (
    <div data-canvas-ui="" className="fz-pop absolute z-20" data-state="open" style={{ left, top, width }}>
      <div
        className={cn(
          'relative flex h-8 items-center rounded-sm border bg-raised shadow-float transition-[border-color,box-shadow] duration-100 touch:h-11',
          invalid ? 'border-danger ring-3 ring-danger-bg' : 'ring-focus',
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
          className="dim h-full w-full rounded-sm bg-transparent pr-9 pl-2.5 text-center text-base font-medium text-fg-strong outline-none touch:text-lead"
        />
        <span aria-hidden className="dim pointer-events-none absolute right-2.5 text-meta text-fg-muted">
          mm
        </span>
      </div>
      <p
        id={hintId}
        className={cn(
          'mt-1 w-max max-w-60 rounded-xs px-1.5 py-0.5 text-micro',
          invalid ? 'border border-danger-line bg-danger-bg text-danger' : 'bg-inverse text-fg-inverse',
        )}
      >
        {invalid ? t('dimension.invalid') : allowPair ? t('dimension.hintPair') : t('dimension.hint')}
      </p>
    </div>
  )
}
