/**
 * Zona izquierda de la barra superior, vacía por defecto. Una pantalla puede ocuparla con su propio
 * contexto: el editor de cotización sube aquí su cabecera para darle ese alto al dibujo.
 *
 *   import { TopbarPortal } from '../../app/shell/TopbarSlot'
 *   <TopbarPortal fallback={<Cabecera />}><Cabecera /></TopbarPortal>
 */
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

let target: HTMLElement | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Lugar del shell donde se dibuja el contenido de las pantallas. */
export function TopbarSlot({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div
        ref={(el) => {
          if (target === el) return
          target = el
          emit()
        }}
        className="flex min-w-0 flex-1 items-center gap-2 empty:hidden"
      />
    </div>
  )
}

/** Contenido propio de una pantalla para la barra superior. Sin shell (pruebas), queda `fallback` en su lugar. */
export function TopbarPortal({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(target)
  useEffect(() => {
    const sync = () => setEl(target)
    const unsubscribe = subscribe(sync)
    sync()
    return () => {
      unsubscribe()
    }
  }, [])
  return el ? createPortal(children, el) : fallback
}
