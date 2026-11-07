/**
 * Guardado automático de la plantilla en edición: cada cambio se guarda solo (PUT con la versión
 * leída). Si otra persona guardó en medio (409), se rehacen las operaciones propias sobre su versión
 * (las DocOps son direccionables por id) y se vuelve a guardar; si el cambio no era expresable como
 * operaciones (deshacer, propuesta de la IA), se conserva la versión propia.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DocTemplate, DocTemplateConflictBody, DocTemplateRecord } from '@dekopen/shared'
import { ApiRequestError, humanError } from '../../../lib/api'
import { translate } from '../../../lib/i18n'
import { toast, type SaveStatus } from '../../../ui'
import { templateKeys, templatesApi } from '../api'
import type { EditorAction, EditorState } from '../model/editor'
import es from '../i18n/es'

const DELAY_MS = 650

export interface TemplateAutosave {
  status: SaveStatus
  savedAt: Date | null
  version: number
  /** Guarda ya lo pendiente (antes de salir del editor o duplicar). */
  flush: () => Promise<void>
}

export function useTemplateAutosave(record: DocTemplateRecord | undefined, state: EditorState, dispatch: Dispatch<EditorAction>, enabled: boolean): TemplateAutosave {
  const client = useQueryClient()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const version = useRef(record?.version ?? 0)
  const saved = useRef<DocTemplate | null>(record?.template ?? null)
  const inflight = useRef<Promise<void> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(state)
  latest.current = state
  const id = record?.id

  // Al cargar otra plantilla (o recargarla), partir de lo que dice el servidor.
  useEffect(() => {
    version.current = record?.version ?? 0
    saved.current = record?.template ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id])

  const save = useCallback(async (): Promise<void> => {
    if (!id || !enabled) return
    if (inflight.current) {
      await inflight.current
      if (latest.current.template === saved.current) return
    }
    const snapshot = latest.current.template
    if (snapshot === saved.current) return
    const ops = latest.current.pendingOps
    dispatch({ type: 'saveStarted' })
    setStatus('saving')
    const job = (async () => {
      try {
        const res = await templatesApi.save(id, snapshot, version.current)
        version.current = res.version
        saved.current = snapshot
        client.setQueryData(templateKeys.one(id), { ...res, template: snapshot })
        void client.invalidateQueries({ queryKey: templateKeys.list })
        setSavedAt(new Date())
        setStatus(latest.current.template === snapshot ? 'saved' : 'saving')
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 409 && error.body) {
          const body = error.body as DocTemplateConflictBody
          version.current = body.version
          const server = body.template.template
          const pendingNow = latest.current.pendingOps
          if (ops && pendingNow) {
            saved.current = server
            dispatch({ type: 'rebase', server, ops: [...ops, ...pendingNow] })
            toast.info(translate(es, 'toasts.conflict'), { id: `tpl-conflict-${id}` })
          } else {
            // No era expresable como operaciones: se guarda la versión propia sobre la vigente.
            saved.current = null
          }
          setStatus('saving')
          return
        }
        const offline = error instanceof ApiRequestError && (error.status === 0 || error.status >= 500)
        setStatus(offline ? 'offline' : 'error')
        if (!offline) toast.error(translate(es, 'toasts.saveFailed', { reason: humanError(error) }), { id: `tpl-save-${id}` })
      }
    })()
    inflight.current = job
    try {
      await job
    } finally {
      inflight.current = null
    }
  }, [client, dispatch, enabled, id])

  // Cada cambio programa un guardado; un conflicto resuelto o una falla de red reintenta solo.
  useEffect(() => {
    if (!id || !enabled) return
    if (state.template === saved.current) return
    if (timer.current) clearTimeout(timer.current)
    const wait = status === 'offline' ? 4000 : DELAY_MS
    timer.current = setTimeout(() => void save(), wait)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [state.template, id, enabled, save, status])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    await save()
  }, [save])

  // Al salir con cambios pendientes, se guardan igual (sin esperar la respuesta).
  useEffect(() => {
    const onHide = () => {
      if (latest.current.template !== saved.current) void save()
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
  }, [save])

  return { status, savedAt, version: version.current, flush }
}
