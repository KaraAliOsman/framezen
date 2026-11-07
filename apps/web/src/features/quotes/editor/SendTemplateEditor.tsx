/** Plantilla del mensaje del taller, por canal e idioma. Las variables se ponen con un toque. */
import { useRef, useState } from 'react'
import { DEFAULT_SENDING, SEND_VARIABLES, type Locale, type SendChannel, type SendTemplates, type SendVariable } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { useSettings, useUpdateSettings } from '../../../lib/hooks'
import { useT } from '../../../lib/i18n'
import { Button, Textarea } from '../../../ui'
import es from '../i18n/es'
import { defaultSendTemplate, sendTemplate, unknownSendVariables } from '../lib/share'
import { toast } from './toasts'

export function SendTemplateEditor({
  channel,
  locale,
  languageName,
  templates,
  onClose,
  onSaved,
}: {
  channel: SendChannel
  locale: Locale
  languageName: string
  templates: SendTemplates
  onClose: () => void
  onSaved: (templates: SendTemplates) => void
}) {
  const t = useT(es)
  const update = useUpdateSettings()
  const sending = useSettings().data?.sending ?? DEFAULT_SENDING
  const area = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(() => sendTemplate(templates, channel, locale))
  const unknown = unknownSendVariables(value)

  const insert = (name: SendVariable) => {
    const el = area.current
    const token = `{${name}}`
    if (!el) return setValue((v) => v + token)
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    setValue(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const save = (template: string) => {
    const next: SendTemplates = { ...templates, [channel]: { ...templates[channel], [locale]: template } }
    update.mutate(
      { sending: { ...sending, templates: next } },
      {
        onSuccess: () => {
          toast.success(t('send.templateSaved'))
          onSaved(next)
        },
        onError: (error) => toast.error(humanError(error)),
      },
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-table text-fg-muted">{t('send.templateHint', { language: languageName, channel: t(channel === 'whatsapp' ? 'send.whatsapp' : 'send.mail') })}</p>
      <Textarea ref={area} rows={9} value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('send.templateAria')} className="text-table" />
      <div>
        <div className="mb-1.5 text-table font-medium text-fg-strong">{t('send.variables')}</div>
        <div className="flex flex-wrap gap-1.5">
          {SEND_VARIABLES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => insert(name)}
              className="inline-flex h-7 items-center rounded-sm bg-sunken px-2 text-table text-fg transition-colors duration-100 hover:bg-hover touch:h-9"
            >
              {t(`send.variable.${name}`)}
            </button>
          ))}
        </div>
      </div>
      {unknown.length ? <p className="text-meta text-warning">{t('send.unknownVariables', { names: unknown.join(', ') })}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button variant="ghost" className="mr-auto" onClick={() => save('')} disabled={update.isPending || value === defaultSendTemplate(channel, locale)}>
          {t('send.templateRestore')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t('send.templateCancel')}
        </Button>
        <Button variant="primary" onClick={() => save(value)} loading={update.isPending}>
          {t('send.templateSave')}
        </Button>
      </div>
    </div>
  )
}
