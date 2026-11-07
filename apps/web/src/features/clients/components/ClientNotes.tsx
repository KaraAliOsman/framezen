import { useEffect, useState } from 'react'
import { useT } from '../../../lib/i18n'
import { SaveIndicator, Textarea, type SaveStatus } from '../../../ui'
import es from '../i18n/es'

/**
 * Notas internas del cliente, siempre editables. Cada cambio entra a la misma cola de guardado de
 * la ficha (se agrupan solos), así que nunca hay botón «Guardar».
 */
export function ClientNotes({
  value,
  onChange,
  status,
  savedAt,
  readOnly,
}: {
  value: string
  onChange: (value: string) => void
  status: SaveStatus
  savedAt: Date | null
  readOnly?: boolean
}) {
  const t = useT(es)
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  // Lo que llega de fuera (otra pestaña) solo pisa si no estás escribiendo.
  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  return (
    <div className="flex max-w-3xl flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="client-notes" className="text-table font-medium text-fg">
          {t('notes.label')}
        </label>
        <SaveIndicator status={status} savedAt={savedAt} />
      </div>
      <Textarea
        id="client-notes"
        value={draft}
        readOnly={readOnly}
        rows={8}
        placeholder={t('placeholders.notes')}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(e.target.value)
        }}
        className="min-h-40 leading-6"
      />
      <p className="text-meta text-fg-muted">{t('notes.hint')}</p>
    </div>
  )
}
