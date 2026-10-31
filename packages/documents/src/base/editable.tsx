import { createElement, useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
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
}: EditableTextProps) {
  const isOn = editable && !!onChange
  const ref = useRef<HTMLElement | null>(null)
  // Si el valor no cambió para React (p. ej. una edición que no se aplicó), el DOM puede seguir
  // mostrando lo escrito: al volver a dibujar, sin foco, se repone el valor vigente.
  useLayoutEffect(() => {
    const el = ref.current
    if (!isOn || !el || el === el.ownerDocument.activeElement) return
    if (el.textContent !== value) el.textContent = value
  })
  if (!isOn) {
    if (rich && !inline) {
      return createElement(as === 'span' || as === 'strong' ? 'div' : as, { className, 'data-field': field }, <RichText text={value} />)
    }
    return createElement(as, { className: clsx(!inline && 'fzd-pre', className), 'data-field': field }, value)
  }
  const commit = (event: FocusEvent<HTMLElement>) => {
    const next = (event.currentTarget.innerText ?? '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim()
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
      className: clsx('fzd-editable', 'fzd-editable--on', inline ? 'fzd-editable--inline' : 'fzd-pre', className),
      contentEditable: 'plaintext-only' as const,
      suppressContentEditableWarning: true,
      spellCheck: true,
      role: 'textbox',
      'aria-multiline': inline ? undefined : true,
      'aria-label': placeholder,
      'data-field': field,
      'data-placeholder': placeholder,
      onBlur: commit,
      onKeyDown,
    },
    value,
  )
}
