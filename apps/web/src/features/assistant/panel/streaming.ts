/**
 * Lo que hace que una respuesta se lea sin saltos. Los fragmentos llegan a tirones; aquí se reparten
 * parejo en el tiempo, y el desplazamiento acompaña al texto en vez de saltar línea por línea.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useReducedMotion } from 'motion/react'

/** Letras por segundo con la cola vacía, y cuánto se apura por cada letra atrasada. */
const BASE_RATE = 60
const CATCH_UP = 7

/**
 * Texto que se va mostrando. Avanza más rápido mientras más atraso lleva, así nunca se queda atrás de
 * lo que llega ni se detiene de golpe al terminar.
 */
export function useSmoothText(text: string, active: boolean): { shown: string; settling: boolean } {
  const reduced = useReducedMotion()
  const [position, setPosition] = useState(active ? 0 : text.length)
  const live = useRef({ text, position, last: 0, raf: 0 })
  live.current.text = text

  useEffect(() => {
    const state = live.current
    if (reduced) {
      state.position = text.length
      setPosition(text.length)
      return
    }
    // el texto cambió por otro (el mensaje final corrige al flujo): no se reescribe a la vista
    if (state.position > text.length) {
      state.position = text.length
      setPosition(text.length)
      return
    }
    if (state.position >= text.length || state.raf) return
    state.last = 0
    const tick = (ms: number) => {
      const dt = state.last ? Math.min((ms - state.last) / 1000, 0.05) : 1 / 60
      state.last = ms
      const backlog = state.text.length - state.position
      if (backlog <= 0) {
        state.raf = 0
        return
      }
      const step = Math.max(1, Math.ceil(dt * (BASE_RATE + backlog * CATCH_UP)))
      state.position = Math.min(state.text.length, state.position + step)
      setPosition(state.position)
      state.raf = requestAnimationFrame(tick)
    }
    state.raf = requestAnimationFrame(tick)
  }, [text, reduced])

  useEffect(() => {
    const state = live.current
    return () => {
      cancelAnimationFrame(state.raf)
      state.raf = 0
    }
  }, [])

  return { shown: text.slice(0, Math.min(position, text.length)), settling: position < text.length }
}

/**
 * Oculta el marcado a medio llegar: un `**` abierto se vería como asteriscos y luego saltaría a negrita.
 */
export function hideOpenMarks(text: string): string {
  const bold = text.split('**').length - 1
  let out = bold % 2 === 1 ? text.slice(0, text.lastIndexOf('**')) : text
  const ticks = out.split('`').length - 1
  if (ticks % 2 === 1) out = out.slice(0, out.lastIndexOf('`'))
  return out
}

/**
 * Mantiene la conversación pegada abajo mientras crece. Si la persona sube a releer, se suelta y no la
 * mueve más; al volver abajo se pega de nuevo.
 */
export function useStickToBottom(scroller: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>) {
  const reduced = useReducedMotion()
  const stick = useRef(true)
  const [detached, setDetached] = useState(false)
  const raf = useRef(0)
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced

  const follow = (instant = false) => {
    const el = scroller.current
    if (!el) return
    if (instant || reducedRef.current) {
      el.scrollTop = el.scrollHeight
      return
    }
    if (raf.current) return
    let last = 0
    const tick = (ms: number) => {
      const dt = last ? Math.min((ms - last) / 1000, 0.05) : 1 / 60
      last = ms
      const target = el.scrollHeight - el.clientHeight
      const gap = target - el.scrollTop
      if (gap <= 0.5 || !stick.current) {
        if (stick.current) el.scrollTop = target
        raf.current = 0
        return
      }
      el.scrollTop += Math.max(gap * (1 - Math.exp(-dt * 16)), 1)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    const el = scroller.current
    const inner = content.current
    if (!el || !inner) return
    let lastTop = el.scrollTop
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      if (el.scrollTop < lastTop - 2 && distance > 8) stick.current = false
      else if (distance < 32) stick.current = true
      lastTop = el.scrollTop
      setDetached(!stick.current && distance > 120)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => stick.current && follow()) : null
    observer?.observe(inner)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer?.disconnect()
      cancelAnimationFrame(raf.current)
      raf.current = 0
    }
    // follow solo lee refs
  }, [scroller, content]) // eslint-disable-line react-hooks/exhaustive-deps

  // al abrir ya está abajo: sin animar
  useLayoutEffect(() => follow(true), []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    detached,
    /** Vuelve abajo y se pega (al pulsar el botón, o al enviar un mensaje). */
    toBottom(instant = false) {
      stick.current = true
      setDetached(false)
      follow(instant)
    },
  }
}
