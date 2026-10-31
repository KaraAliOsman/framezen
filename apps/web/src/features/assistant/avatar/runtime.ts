/**
 * Infraestructura compartida por todas las instancias de Marco en la página: un solo
 * requestAnimationFrame y un solo listener de puntero, sin importar cuántos avatares
 * haya montados.
 */

type FrameCallback = (ms: number) => void

const subscribers = new Set<FrameCallback>()
let rafId = 0

function loop(ms: number): void {
  rafId = requestAnimationFrame(loop)
  // copia: un callback puede desuscribirse durante el recorrido
  for (const callback of Array.from(subscribers)) callback(ms)
}

/** Suscribe un callback al bucle compartido. Devuelve la función para salir. */
export function subscribeFrame(callback: FrameCallback): () => void {
  if (typeof requestAnimationFrame !== 'function') return () => {}
  subscribers.add(callback)
  if (!rafId) rafId = requestAnimationFrame(loop)
  return () => {
    subscribers.delete(callback)
    if (subscribers.size === 0 && rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }
}

/* -------------------------------------------------------------- puntero */

let pointer: { x: number; y: number } | null = null
let pointerUsers = 0

function onPointerMove(event: PointerEvent): void {
  // el táctil no deja un cursor quieto: un dedo levantado dejaría la mirada fija
  if (event.pointerType === 'touch') return
  pointer = { x: event.clientX, y: event.clientY }
}

function onPointerOut(event: PointerEvent): void {
  // relatedTarget null = el puntero salió de la ventana
  if (event.relatedTarget === null) pointer = null
}

function onLeave(): void {
  pointer = null
}

/** Empieza a seguir el puntero (con conteo de referencias). Devuelve la función para soltar. */
export function trackPointer(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (pointerUsers++ === 0) {
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerout', onPointerOut, { passive: true })
    document.addEventListener('pointerleave', onLeave)
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--pointerUsers === 0) {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('pointerleave', onLeave)
      pointer = null
    }
  }
}

/** Última posición conocida del puntero (coordenadas de cliente) o null. */
export function currentPointer(): { x: number; y: number } | null {
  return pointer
}

/* ------------------------------------------------- movimiento reducido */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

export function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(REDUCED_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(REDUCED_QUERY).matches
}
