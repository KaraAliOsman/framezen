import { useEffect, type RefObject } from 'react'
import { Toaster as Sonner, toast, type ExternalToast } from 'sonner'
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { useOptionalTheme } from '../lib/theme'

export { toast }

/** Duración por defecto (5 s) y con «Deshacer» (8 s), según SPEC §1.2. */
export const TOAST_DURATION = 5000
export const UNDO_DURATION = 8000

/**
 * Distancia de los avisos de arriba al borde superior del contenido: la cabecera del lienzo
 * (Diseño | Documento, 48 px) más la fila Interior | Exterior. Solo el editor usa avisos arriba
 * (`position: 'top-center'`, ver features/quotes/editor/toasts.ts); el resto de la app, abajo.
 */
export const TOP_TOAST_GAP = 96

/** Contenedor de avisos. Va una vez en la raíz de la app. */
export function Toaster() {
  const resolved = useOptionalTheme()?.resolved ?? 'light'
  return (
    <Sonner
      theme={resolved}
      position="bottom-center"
      duration={TOAST_DURATION}
      gap={8}
      visibleToasts={3}
      // Arriba: bajo la barra superior (48 px si no hay shell) y la cabecera del lienzo, nunca encima.
      offset={{ top: `var(--fz-toast-area-top, ${48 + TOP_TOAST_GAP}px)`, right: 20, bottom: 20, left: 20 }}
      mobileOffset={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
      containerAriaLabel="Avisos"
      icons={{
        success: <CircleCheck aria-hidden className="size-4" strokeWidth={2} />,
        error: <CircleAlert aria-hidden className="size-4" strokeWidth={2} />,
        warning: <TriangleAlert aria-hidden className="size-4" strokeWidth={2} />,
        info: <Info aria-hidden className="size-4" strokeWidth={2} />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'fz-toast',
          title: 'font-medium',
          actionButton: 'fz-toast-action',
          cancelButton: 'fz-toast-cancel',
        },
      }}
    />
  )
}

interface ToastArea {
  el: HTMLElement
  gap: number
}
const toastAreas: ToastArea[] = []

/** Publica la zona más interna (p. ej. el lienzo del editor dentro de <main>) para styles.css. */
function publishToastArea() {
  const root = document.documentElement
  const area = toastAreas.find((a) => !toastAreas.some((b) => b !== a && a.el.contains(b.el)))
  if (!area) {
    root.style.removeProperty('--fz-toast-area-x')
    root.style.removeProperty('--fz-toast-area-top')
    return
  }
  const r = area.el.getBoundingClientRect()
  root.style.setProperty('--fz-toast-area-x', `${Math.round(r.left + r.width / 2)}px`)
  root.style.setProperty('--fz-toast-area-top', `${Math.round(r.top + area.gap)}px`)
}

/**
 * Zona de los avisos de arriba: se centran sobre `ref` en vez de sobre la ventana y bajan `gap` px
 * desde su borde superior. El shell registra su <main> (bajo la barra superior + la cabecera del
 * lienzo), así no tapan la barra lateral, la columna de ítems ni el inspector. Una pantalla puede
 * registrar una zona más precisa dentro (p. ej. el lienzo del editor): gana la más interna.
 */
export function useToastArea(ref: RefObject<HTMLElement | null>, { gap = TOP_TOAST_GAP }: { gap?: number } = {}) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const area: ToastArea = { el, gap }
    toastAreas.push(area)
    publishToastArea()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publishToastArea)
    observer?.observe(el)
    window.addEventListener('resize', publishToastArea)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', publishToastArea)
      toastAreas.splice(toastAreas.indexOf(area), 1)
      publishToastArea()
    }
  }, [ref, gap])
}

export interface UndoToastOptions extends Omit<ExternalToast, 'action' | 'duration'> {
  /** Texto del botón (por defecto «Deshacer»). */
  actionLabel?: string
  /** Se llama si el aviso se cierra sin deshacer (para confirmar el borrado en el servidor). */
  onCommit?: () => void
}

/**
 * Aviso con «Deshacer» durante 8 s. Preferido a un diálogo de confirmación para todo lo reversible.
 *   toastUndo('Borraste la V3', () => restore())
 */
export function toastUndo(message: string, onUndo: () => void, { actionLabel = 'Deshacer', onCommit, ...options }: UndoToastOptions = {}) {
  let undone = false
  return toast(message, {
    ...options,
    duration: UNDO_DURATION,
    action: {
      label: actionLabel,
      onClick: () => {
        undone = true
        onUndo()
      },
    },
    onAutoClose: () => {
      if (!undone) onCommit?.()
    },
    onDismiss: () => {
      if (!undone) onCommit?.()
    },
  })
}
