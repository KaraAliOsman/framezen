/**
 * «Duplicar para…»: repetir una obra para otro cliente en tres pasos (elegir cliente, Enter, Enter).
 * El buscador de clientes abre solo, se puede crear el cliente al vuelo y el título llega limpio y
 * editable. La copia nace como borrador nuevo y el servidor la calcula con los precios de hoy.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import type { Client } from '@dekopen/shared'
import { humanError } from '../../lib/api'
import { useClients, useCreateClient } from '../../lib/hooks'
import { useT } from '../../lib/i18n'
import { Button, Combobox, Dialog, DialogContent, Field, Input, toast } from '../../ui'
import es from './i18n/es'
import { QUOTE_LIMITS } from './model/doc'

const MENU_CLOSE_MS = 120
/** El buscador de clientes devuelve el foco a su botón al terminar de cerrarse. */
const PICKER_CLOSE_MS = 160

export interface DuplicateSource {
  id: string
  number: number
  title: string
  clientId?: string | null
  clientName?: string
}

/** Lo que recibe POST /quotes/:id/duplicate. Sin `clientId`, la copia sigue con el mismo cliente. */
export interface DuplicateBody {
  clientId?: string | null
  title: string
}

/** Título sin el «(copia)» que dejaron duplicados anteriores. */
export function cleanCopyTitle(title: string): string {
  return title.replace(/(\s*\(copia\))+\s*$/i, '').trim()
}

export function DuplicateDialog({ source, onClose, run }: { source: DuplicateSource | null; onClose: () => void; run: (body: DuplicateBody) => Promise<void> }) {
  return (
    <Dialog open={!!source} onOpenChange={(open) => !open && onClose()}>
      {source ? <DuplicateContent key={source.id} source={source} onClose={onClose} run={run} /> : null}
    </Dialog>
  )
}

function DuplicateContent({ source, onClose, run }: { source: DuplicateSource; onClose: () => void; run: (body: DuplicateBody) => Promise<void> }) {
  const t = useT(es)
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const clients = useClients('')
  const createClient = useCreateClient()
  const submitRef = useRef<HTMLButtonElement>(null)
  // `undefined` = sigue el cliente de la original; `null` = sin cliente.
  const [picked, setPicked] = useState<string | null | undefined>(undefined)
  const [created, setCreated] = useState<Client | null>(null)
  const [title, setTitle] = useState(() => cleanCopyTitle(source.title))
  const [busy, setBusy] = useState(false)

  const list = useMemo(() => {
    const known = [...(clients.data ?? [])]
    return created && !known.some((c) => c.id === created.id) ? [created, ...known] : known
  }, [clients.data, created])
  // La lista de cotizaciones solo conoce el nombre del cliente: se busca para mostrarlo elegido.
  const original = source.clientId ?? list.find((c) => c.name === source.clientName)?.id
  const value = picked === undefined ? original : (picked ?? undefined)
  const options = useMemo(
    () => list.map((c) => ({ value: c.id, label: c.name, hint: c.city || c.rut || undefined, keywords: [c.rut ?? '', c.email ?? '', c.phone ?? ''] })),
    [list],
  )

  // El buscador abre solo: escribir el nombre es lo primero que se hace aquí.
  // Espera a que el menú que abrió el diálogo termine de cerrarse y devuelva el foco.
  useEffect(() => {
    const timer = setTimeout(() => formRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.click(), MENU_CLOSE_MS)
    return () => clearTimeout(timer)
  }, [])

  // Elegido el cliente, Enter duplica (el foco vuelve al botón, no al buscador).
  const focusSubmit = () => setTimeout(() => submitRef.current?.focus(), PICKER_CLOSE_MS)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      await run({ ...(picked === undefined ? {} : { clientId: picked }), title: title.trim() })
      onClose()
    } catch (error) {
      toast.error(humanError(error))
      setBusy(false)
    }
  }

  return (
    <DialogContent
      size="sm"
      title={t('duplicate.title')}
      description={t('duplicate.description', { number: source.number })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('duplicate.cancel')}
          </Button>
          <Button ref={submitRef} variant="primary" icon={Copy} type="submit" form={formId} shortcut="enter" loading={busy}>
            {t('duplicate.submit')}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        // Con el buscador cerrado, Enter duplica aunque el foco siga en su botón: nunca lo reabre.
        onKeyDownCapture={(e) => {
          const target = e.target as HTMLElement
          if (e.key !== 'Enter' || target.tagName !== 'BUTTON' || target.getAttribute('aria-expanded') !== 'false') return
          e.preventDefault()
          e.stopPropagation()
          void submit()
        }}
      >
        <Field label={t('client.label')}>
          <Combobox
            value={value}
            onChange={(id) => {
              setPicked(id ?? null)
              focusSubmit()
            }}
            options={options}
            clearable
            clearLabel={t('client.clear')}
            placeholder={t('client.placeholder')}
            searchPlaceholder={t('client.search')}
            emptyText={t('client.empty')}
            createLabel={(name) => t.rich('client.create', { b: <span className="font-medium" />, name })}
            onCreate={async (name) => {
              try {
                const client = await createClient.mutateAsync({ name })
                setCreated(client)
                setPicked(client.id)
                focusSubmit()
              } catch (error) {
                toast.error(humanError(error))
              }
            }}
            aria-label={t('client.label')}
          />
        </Field>
        <Field label={t('list.columns.title')}>
          <Input value={title} maxLength={QUOTE_LIMITS.title} placeholder={t('header.title')} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </form>
    </DialogContent>
  )
}
