import { useCallback, useMemo, useReducer } from 'react'
import { useShortcut } from './useShortcut'

/**
 * Historial genérico para deshacer/rehacer (SPEC §5: Ctrl+Z / Ctrl+Shift+Z sobre la cotización).
 * Los cambios con la misma `mergeKey` dentro de `mergeWindowMs` se agrupan en un solo paso
 * (p. ej. escribir un título letra por letra).
 */
export interface UndoHistory<T> {
  past: T[]
  present: T
  future: T[]
  lastKey?: string
  lastAt?: number
}

export type UndoAction<T> =
  | {
      type: 'set'
      value: T | ((previous: T) => T)
      mergeKey?: string
      at: number
      limit: number
      mergeWindowMs: number
      skipHistory?: boolean
    }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; value: T }

export function createHistory<T>(value: T): UndoHistory<T> {
  return { past: [], present: value, future: [] }
}

export function historyReducer<T>(state: UndoHistory<T>, action: UndoAction<T>): UndoHistory<T> {
  switch (action.type) {
    case 'set': {
      const value =
        typeof action.value === 'function' ? (action.value as (previous: T) => T)(state.present) : action.value
      if (Object.is(value, state.present)) return state
      if (action.skipHistory) return { ...state, present: value }
      const merge =
        action.mergeKey !== undefined &&
        action.mergeKey === state.lastKey &&
        state.lastAt !== undefined &&
        action.at - state.lastAt <= action.mergeWindowMs
      if (merge) return { ...state, present: value, future: [], lastAt: action.at }
      const past = [...state.past, state.present]
      if (past.length > action.limit) past.splice(0, past.length - action.limit)
      return { past, present: value, future: [], lastKey: action.mergeKey, lastAt: action.at }
    }
    case 'undo': {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      const [next, ...future] = state.future
      return { past: [...state.past, state.present], present: next, future }
    }
    case 'reset':
      return createHistory(action.value)
  }
}

export interface UndoOptions {
  /** Pasos guardados (por defecto 100). */
  limit?: number
  /** Ventana para agrupar cambios con la misma `mergeKey` (por defecto 800 ms). */
  mergeWindowMs?: number
  /** Enlazar ⌘Z / ⇧⌘Z / ⌘Y (fuera de campos de texto, que tienen su propio deshacer). */
  keyboard?: boolean
}

export interface SetOptions {
  mergeKey?: string
  /** Reemplaza el presente sin crear un paso (p. ej. datos que llegan del servidor). */
  skipHistory?: boolean
}

export interface UndoApi<T> {
  value: T
  set: (next: T | ((previous: T) => T), options?: SetOptions) => void
  undo: () => void
  redo: () => void
  reset: (value: T) => void
  canUndo: boolean
  canRedo: boolean
  history: UndoHistory<T>
}

export function useUndo<T>(initial: T, { limit = 100, mergeWindowMs = 800, keyboard = false }: UndoOptions = {}): UndoApi<T> {
  const [history, dispatch] = useReducer(historyReducer<T>, initial, createHistory)

  const set = useCallback<UndoApi<T>['set']>(
    (next, options = {}) => {
      // El actualizador se resuelve dentro del reducer, contra el presente real.
      dispatch({
        type: 'set',
        value: next,
        mergeKey: options.mergeKey,
        skipHistory: options.skipHistory,
        at: Date.now(),
        limit,
        mergeWindowMs,
      })
    },
    [limit, mergeWindowMs],
  )

  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const reset = useCallback((value: T) => dispatch({ type: 'reset', value }), [])

  useShortcut('mod+z', undo, { enabled: keyboard })
  useShortcut(['shift+mod+z', 'mod+y'], redo, { enabled: keyboard })

  return useMemo(
    () => ({
      value: history.present,
      set,
      undo,
      redo,
      reset,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      history,
    }),
    [history, set, undo, redo, reset],
  )
}
