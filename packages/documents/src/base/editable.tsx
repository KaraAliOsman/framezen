import { createElement, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { clsx } from './clsx'
import { parseRichText, type RichSpan } from './text'

function renderSpans(list: RichSpan[]): ReactNode {
  return list.map((s, i) => (s.strong ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))
}

/** Markdown mínimo (párrafos, listas, títulos, negrita) como HTML seguro. */
export function RichText({ text, className }: { text: string | undefined; className?: string }) {
  const blocks = parseRichText(text)
  if (blocks.length === 0) return null
  return (
    <div className={clsx('fzd-rich', className)}>
      {blocks.map((block, i) => {
        if (block.type === 'ul')
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderSpans(item)}</li>
              ))}
            </ul>
          )
        if (block.type === 'h') return <h4 key={i}>{renderSpans(block.spans)}</h4>
        return <p key={i}>{renderSpans(block.spans)}</p>
      })}
    </div>
  )
}

export type EditableTag = 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'strong'

export interface EditableTextProps {
  value: string
  /** Nombre del campo (se informa en onChange y queda en data-field). */
  field?: string
  /** En pantalla permite editar en el lugar; en PDF siempre es texto plano. */
  editable?: boolean
  onChange?: (value: string, field?: string) => void
  as?: EditableTag
  /** En modo lectura interpreta markdown mínimo (condiciones). */
  rich?: boolean
  /** Una sola línea: Enter confirma. */
  inline?: boolean
  placeholder?: string
  className?: string
  /**
   * Cómo se ve sin el foco: lo mismo que imprime el PDF (marcadores resueltos, listas, negritas). Al
   * entrar se cambia por el texto fuente, en el mismo elemento, y al salir vuelve.
   */
  display?: ReactNode
}

/**
 * Texto editable con contentEditable (solo texto plano, sin HTML pegado). Confirma
 * al salir del campo; Escape descarta. Sin `editable` se imprime como texto.
 */
export function EditableText({
  value,
  field,
  editable = false,
  onChange,
  as = 'div',
  rich = false,
  inline = false,
  placeholder,
  className,
  display,
}: EditableTextProps) {
  const isOn = editable && !!onChange
  const ref = useRef<HTMLElement | null>(null)
  const [focused, setFocused] = useState(false)
  const source = focused || display === undefined
  const press = useRef<{ x: number; y: number } | null>(null)
  // Al pasar al texto fuente el DOM cambia: el cursor se pone donde se hizo clic (o al final, con teclado).
  useLayoutEffect(() => {
    const el = ref.current
    if (!focused || display === undefined || !el) return
    const doc = el.ownerDocument
    const selection = doc.getSelection()
    const at = press.current && typeof doc.caretRangeFromPoint === 'function' ? doc.caretRangeFromPoint(press.current.x, press.current.y) : null
    press.current = null
    const range = at && el.contains(at.startContainer) ? at : doc.createRange()
    if (range !== at) {
      range.selectNodeContents(el)
      range.collapse(false)
    }
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [focused, display])
  // Si el valor no cambió para React (p. ej. una edición que no se aplicó), el DOM puede seguir
  // mostrando lo escrito: al volver a dibujar, sin foco, se repone el valor vigente.
  useLayoutEffect(() => {
    const el = ref.current
    if (!isOn || !el || el === el.ownerDocument.activeElement || display !== undefined) return
    if (el.textContent !== value) el.textContent = value
  })
  if (!isOn) {
    if (rich && !inline) {
      return createElement(as === 'span' || as === 'strong' ? 'div' : as, { className, 'data-field': field }, <RichText text={value} />)
    }
    return createElement(as, { className: clsx(!inline && 'fzd-pre', className), 'data-field': field }, value)
  }
  const commit = (event: FocusEvent<HTMLElement>) => {
    // Se fue sin haber llegado al texto fuente: lo que hay en el DOM es la vista, no lo escrito.
    if (!source) return
    const next = (event.currentTarget.innerText ?? '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    setFocused(false)
    if (next !== value.trim()) onChange?.(next, field)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.currentTarget.innerText = value
      event.currentTarget.blur()
    } else if (event.key === 'Enter' && (inline || event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }
  return createElement(
    as,
    {
      // contentEditable deja el texto escrito en el DOM y React no lo reemplaza si el valor
      // vuelve al anterior (deshacer): con la clave por valor el nodo se recrea y siempre
      // muestra el valor vigente.
      key: value,
      ref,
      className: clsx('fzd-editable', 'fzd-editable--on', inline ? 'fzd-editable--inline' : source && 'fzd-pre', className),
      contentEditable: 'plaintext-only' as const,
      suppressContentEditableWarning: true,
      spellCheck: true,
      role: 'textbox',
      'aria-multiline': inline ? undefined : true,
      'aria-label': placeholder,
      'data-field': field,
      'data-placeholder': placeholder,
      // Con el mouse se cambia al soltar: si el DOM cambia en medio del clic, el navegador pierde el cursor.
      onMouseDown: (event: MouseEvent) => {
        if (display === undefined || focused) return
        press.current = { x: event.clientX, y: event.clientY }
        const win = event.currentTarget.ownerDocument.defaultView
        const up = (done: globalThis.MouseEvent) => {
          win?.removeEventListener('mouseup', up)
          if (press.current) press.current = { x: done.clientX, y: done.clientY }
          if (ref.current === ref.current?.ownerDocument.activeElement) setFocused(true)
        }
        win?.addEventListener('mouseup', up)
      },
      onFocus: () => {
        if (!press.current) setFocused(true)
      },
      onBlur: commit,
      onKeyDown,
    },
    source ? value : display,
  )
}
