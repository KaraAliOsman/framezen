/**
 * Dónde se ubica el panel de Marco en escritorio. Con espacio (xl y más) va a la derecha y el editor
 * le reserva una columna (`--fz-assistant-inset`). Bajo xl el editor no tiene columna de inspector que
 * ceder y reservar 380 px dejaría el lienzo en ~150 px: ahí Marco se acopla en el lugar de la columna
 * «Obra y ventanas» (la tapa mientras está abierto) y el lienzo conserva todo su ancho, así el cambio
 * se ve. Al minimizar o cerrar, la columna vuelve a estar a la vista.
 */
import { useLayoutEffect, useState } from 'react'

/** Columna de ventanas del editor de escritorio (zona quotes). */
export const ITEMS_ANCHOR = '[data-assistant-anchor="items"], aside[aria-label="Obra y ventanas"]'

/** Por debajo de esto el panel no cabe con dignidad en la columna: sigue flotando. */
const MIN_WIDTH = 240
const MIN_HEIGHT = 360

export interface DockRect {
  left: number
  top: number
  width: number
  height: number
}

/** Rectángulo útil de la columna (en px enteros) o null si no está o es muy chica. */
export function readAnchor(el: Element | null): DockRect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < MIN_WIDTH || r.height < MIN_HEIGHT) return null
  return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
}

function same(a: DockRect | null, b: DockRect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

/**
 * Sigue la columna de ventanas mientras `enabled`: se vuelve a medir al cambiar el tamaño de la
 * ventana, de la columna o de su fila (p. ej. al plegar la barra lateral o al cambiar de editor).
 * Mientras Marco la tapa, la columna queda `inert` (el teclado y el lector de pantalla no caen en
 * controles ocultos); al minimizar o cerrar vuelve a estar disponible. `watch` vuelve a buscar la
 * columna cuando cambia (p. ej. otra cotización abierta en el editor).
 */
export function useDockAnchor(enabled: boolean, watch?: unknown, selector: string = ITEMS_ANCHOR): DockRect | null {
  const [rect, setRect] = useState<DockRect | null>(null)

  useLayoutEffect(() => {
    if (!enabled || typeof document === 'undefined') {
      setRect(null)
      return
    }
    let observed: Element | null = null
    let covered: Element | null = null
    let frame = 0
    const cover = (el: Element | null) => {
      if (el === covered) return
      if (covered) covered.removeAttribute('inert')
      covered = el && !el.hasAttribute('inert') ? el : null
      covered?.setAttribute('inert', '')
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => schedule()) : null
    const measure = () => {
      const el = document.querySelector(selector)
      if (el !== observed) {
        observed = el
        if (ro) {
          ro.disconnect()
          if (el) {
            ro.observe(el)
            if (el.parentElement) ro.observe(el.parentElement)
          }
        }
      }
      const next = readAnchor(el)
      cover(next ? el : null)
      setRect((prev) => (same(prev, next) ? prev : next))
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      cover(null)
      ro?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [enabled, watch, selector])

  return enabled ? rect : null
}
