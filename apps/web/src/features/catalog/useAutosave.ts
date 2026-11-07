import { useCallback, useEffect, useRef, useState } from 'react'
import { humanError } from '../../lib/api'
import { translate } from '../../lib/i18n'
import { toast, type SaveStatus } from '../../ui'
import es from './i18n/es'
import { enqueueAutosave, registerAutosaveOwner, syncAutosaveGuard, type AutosaveOwner } from './autosaveQueue'

export interface Autosave<T> {
  status: SaveStatus
  savedAt: Date | null
  /** Agenda un guardado (los cambios seguidos se juntan en uno). */
  schedule: (value: T) => void
  /** Guarda ya lo pendiente (al cerrar un panel o salir de la página). */
  flush: () => void
  /** Último error (para mostrar un aviso en línea, nunca un muro). */
  error: unknown
}

/**
 * Guardado automático con espera corta: nunca hay botón «Guardar». Si falla por red, reintenta
 * solo; los cambios quedan en pantalla mientras tanto.
 *
 * Lo pendiente no depende de la pantalla: al desmontar pasa a la cola del módulo
 * (`autosaveQueue`), que lo sigue reintentando aunque estés en otra parte de la app, y cerrar la
 * pestaña con algo sin guardar pide confirmación. Cada `value` reemplaza al anterior, así que debe
 * llevar todo lo pendiente.
 *
 * `key` agrupa lo que se guarda en orden (p. ej. `brand:<id>`): un cambio viejo que se reintenta
 * nunca pisa uno más nuevo de la misma `key` hecho después en otra pantalla.
 */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, delay = 600, key = 'default'): Autosave<T> {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<unknown>(null)
  const draft = useRef<{ value: T } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save
  const keyRef = useRef(key)
  keyRef.current = key
  const mounted = useRef(true)

  const [owner] = useState<AutosaveOwner>(() => {
    const self: AutosaveOwner = {
      hasDraft: () => draft.current !== null,
      flushDraft: () => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
        const job = draft.current
        if (!job) return
        draft.current = null
        const fn = saveRef.current
        enqueueAutosave(keyRef.current, self, job.value, (value) => fn(value as T))
      },
      onSaved: (more) => {
        if (!mounted.current) return
        setError(null)
        if (!more && !draft.current) {
          setStatus('saved')
          setSavedAt(new Date())
        }
      },
      onFailed: (err, willRetry) => {
        if (!mounted.current) {
          // Ya no hay pantalla que lo muestre: el servidor rechazó el dato, se avisa igual.
          if (!willRetry) toast.error(translate(es, 'autosave.failed', { reason: humanError(err) }))
          return
        }
        setError(err)
        setStatus(willRetry ? 'offline' : 'error')
      },
    }
    return self
  })

  const schedule = useCallback(
    (value: T) => {
      draft.current = { value }
      setStatus('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => owner.flushDraft(), delay)
      syncAutosaveGuard()
    },
    [delay, owner],
  )

  const flush = useCallback(() => owner.flushDraft(), [owner])

  useEffect(() => {
    mounted.current = true
    const unregister = registerAutosaveOwner(owner)
    return () => {
      mounted.current = false
      // Lo agendado pasa a la cola del módulo, que lo guarda (y reintenta) aunque salgas de aquí.
      owner.flushDraft()
      unregister()
    }
  }, [owner])

  return { status, savedAt, schedule, flush, error }
}
