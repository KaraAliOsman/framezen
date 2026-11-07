/**
 * Editor del texto libre de una sección: texto con marcas simples (negrita, cursiva, listas,
 * títulos) y datos insertables como chips (`{client.name}`). Guarda el AST acotado (nunca HTML);
 * agrupa la escritura en un solo paso de deshacer.
 */
import { useEffect, useRef, useState } from 'react'
import { Bold, Heading2, Italic, List, ListOrdered } from 'lucide-react'
import { placeholdersFor, type DocTemplateKind, type PlaceholderKey, type RichText } from '@dekopen/shared'
import { useT } from '../../../lib/i18n'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton, Textarea, Button } from '../../../ui'
import { applyMark, insertAt, markupToRichText, richTextToMarkup } from '../model/markup'
import es from '../i18n/es'

export interface RichTextFieldProps {
  value: RichText | undefined
  kind: DocTemplateKind
  label: string
  readOnly?: boolean
  onChange: (value: RichText) => void
}

export function RichTextField({ value, kind, label, readOnly, onChange }: RichTextFieldProps) {
  const t = useT(es)
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(() => richTextToMarkup(value))
  const lastEmitted = useRef<string>(JSON.stringify(value ?? null))

  // Si el valor cambia desde fuera (deshacer, IA), se refleja aquí.
  useEffect(() => {
    const incoming = JSON.stringify(value ?? null)
    if (incoming !== lastEmitted.current) {
      lastEmitted.current = incoming
      setText(richTextToMarkup(value))
    }
  }, [value])

  const emit = (next: string) => {
    setText(next)
    const doc = markupToRichText(next)
    lastEmitted.current = JSON.stringify(doc)
    onChange(doc)
  }

  const mark = (kindOfMark: Parameters<typeof applyMark>[3]) => {
    const el = ref.current
    if (!el) return
    const r = applyMark(text, el.selectionStart, el.selectionEnd, kindOfMark)
    emit(r.value)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(r.start, r.end)
    })
  }

  const insert = (key: PlaceholderKey) => {
    const el = ref.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const r = insertAt(text, start, end, `{${key}}`)
    emit(r.value)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(r.caret, r.caret)
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-table font-medium text-fg">{label}</span>
        {!readOnly ? (
          <div className="flex items-center gap-0.5" role="toolbar" aria-label={label}>
            <IconButton icon={Bold} size="xs" label={t('richtext.bold')} onClick={() => mark('bold')} />
            <IconButton icon={Italic} size="xs" label={t('richtext.italic')} onClick={() => mark('italic')} />
            <IconButton icon={Heading2} size="xs" label={t('richtext.heading')} onClick={() => mark('heading')} />
            <IconButton icon={List} size="xs" label={t('richtext.bullet')} onClick={() => mark('bullet')} />
            <IconButton icon={ListOrdered} size="xs" label={t('richtext.ordered')} onClick={() => mark('ordered')} />
          </div>
        ) : null}
      </div>
      <Textarea ref={ref} value={text} readOnly={readOnly} rows={6} onChange={(e) => emit(e.target.value)} aria-label={label} className="min-h-[132px] text-table" />
      {!readOnly ? (
        <div className="flex items-start justify-between gap-2">
          <p className="text-meta text-fg-muted">{t('richtext.help')}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="xs" variant="ghost" className="shrink-0">
                {t('richtext.insert')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              {placeholdersFor(kind).map((key) => (
                <DropdownMenuItem key={key} onSelect={() => insert(key)} hint={<span className="code-id">{`{${key}}`}</span>}>
                  {t(`richtext.placeholders.${key}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  )
}
