/**
 * Los archivos del compositor. Se leen apenas llegan, así al enviar ya está todo listo y un archivo
 * que no se puede leer se avisa antes, con su motivo.
 */
import { ATTACHMENT_LIMITS, type TurnAttachment } from '@dekopen/shared'
import { useCallback, useMemo, useRef, useState } from 'react'
import { fitTurn, readAttachment } from './read'
import { ReadProblem, type AttachmentDraft, type AttachmentView } from './types'

let nextId = 0

export interface AttachmentsApi {
  drafts: AttachmentDraft[]
  /** Hay algo todavía en lectura: no se puede enviar. */
  reading: boolean
  ready: boolean
  add(files: Iterable<File>): void
  remove(id: string): void
  /** Lo que se envía y lo que queda a la vista en la conversación; vacía la lista. */
  take(): { attachments: TurnAttachment[]; views: AttachmentView[] }
}

export function useAttachments(): AttachmentsApi {
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([])
  const current = useRef(drafts)
  current.current = drafts

  const patch = useCallback((id: string, next: Partial<AttachmentDraft>) => {
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...next } : d)))
  }, [])

  const add = useCallback(
    (files: Iterable<File>) => {
      const incoming = Array.from(files)
      if (!incoming.length) return
      const used = current.current.filter((d) => d.status !== 'error').length
      const fresh: AttachmentDraft[] = incoming.map((file, i) => {
        const over = used + i >= ATTACHMENT_LIMITS.files
        return { id: `file-${++nextId}`, name: file.name || 'archivo', status: over ? 'error' : 'reading', ...(over ? { problem: 'too_many' as const } : {}) }
      })
      setDrafts((list) => [...list, ...fresh])
      fresh.forEach((draft, i) => {
        if (draft.status === 'error') return
        readAttachment(incoming[i]!)
          .then((result) => patch(draft.id, { status: 'ready', kind: result.attachment.kind, attachment: result.attachment, ...(result.preview ? { preview: result.preview } : {}) }))
          .catch((error: unknown) => patch(draft.id, { status: 'error', problem: error instanceof ReadProblem ? error.code : 'unreadable' }))
      })
    },
    [patch],
  )

  const remove = useCallback((id: string) => setDrafts((list) => list.filter((d) => d.id !== id)), [])

  const take = useCallback(() => {
    const ready = current.current.filter((d) => d.status === 'ready' && d.attachment)
    setDrafts([])
    return {
      attachments: fitTurn(ready.map((d) => d.attachment!)),
      views: ready.map((d) => ({ name: d.name, kind: d.attachment!.kind, ...(d.preview ? { preview: d.preview } : {}) })),
    }
  }, [])

  return useMemo(
    () => ({ drafts, reading: drafts.some((d) => d.status === 'reading'), ready: drafts.some((d) => d.status === 'ready'), add, remove, take }),
    [drafts, add, remove, take],
  )
}
