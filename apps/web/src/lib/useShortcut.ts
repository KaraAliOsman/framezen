import { useEffect, useRef } from 'react'

/**
 * Atajos de teclado. Combinaciones como 'mod+k', 'shift+mod+z', 'a', '[', 'escape', 'delete'.
 * `mod` = ⌘ en Mac y Ctrl en el resto. Por defecto no se disparan mientras escribes en un campo.
 */
export interface ParsedShortcut {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  del: 'delete',
  supr: 'delete',
  return: 'enter',
  space: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
}

export function parseShortcut(combo: string): ParsedShortcut {
  const parts = combo.toLowerCase().split('+').map((p) => p.trim())
  const out: ParsedShortcut = { key: '', mod: false, shift: false, alt: false }
  for (const part of parts) {
    if (part === 'mod' || part === 'cmd' || part === 'ctrl' || part === 'meta') out.mod = true
    else if (part === 'shift') out.shift = true
    else if (part === 'alt' || part === 'option') out.alt = true
    else out.key = KEY_ALIASES[part] ?? part
  }
  // '+' como tecla: 'shift++'
  if (!out.key && combo.endsWith('+')) out.key = '+'
  return out
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform
  return /mac|iphone|ipad|ipod/i.test(platform ?? '')
}

export function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut, mac = isMac()): boolean {
  // AltGr (Ctrl+Alt en Windows) produce símbolos como «[» o «/» en teclados latinoamericanos y españoles.
  const altGr = !mac && event.ctrlKey && event.altKey
  if (altGr && !shortcut.mod && !shortcut.alt && !/^[a-z0-9]$/.test(shortcut.key)) {
    return event.key.toLowerCase() === shortcut.key
  }
  const mod = mac ? event.metaKey : event.ctrlKey
  if (mod !== shortcut.mod) return false
  if (event.altKey !== shortcut.alt) return false
  const key = event.key.toLowerCase()
  // Con Shift, teclas como '?' ya llegan transformadas; solo exigimos Shift si es una letra.
  const isLetter = /^[a-z]$/.test(shortcut.key)
  if (isLetter || shortcut.key.length > 1) {
    if (event.shiftKey !== shortcut.shift) return false
  }
  if (key === shortcut.key) return true
  // Respaldo por código físico solo si la tecla no es latina (p. ej. teclado cirílico): KeyK → k.
  // Con letras latinas manda la letra impresa, para no confundir distribuciones como AZERTY.
  if (/^[\x20-\x7e]$/.test(event.key)) return false
  const code = event.code.toLowerCase()
  return code === `key${shortcut.key}` || code === `digit${shortcut.key}`
}

/** ¿El evento viene de un lugar donde se escribe? */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(type)
  }
  return target.getAttribute('role') === 'combobox' || target.getAttribute('role') === 'textbox'
}

export interface ShortcutOptions {
  enabled?: boolean
  /** Disparar también mientras se escribe en un campo (útil para 'mod+k'). */
  allowInInputs?: boolean
  preventDefault?: boolean
}

export function useShortcut(
  combo: string | string[],
  handler: (event: KeyboardEvent) => void,
  { enabled = true, allowInInputs = false, preventDefault = true }: ShortcutOptions = {},
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const key = Array.isArray(combo) ? combo.join('|') : combo

  useEffect(() => {
    if (!enabled) return
    const shortcuts = key.split('|').map(parseShortcut)
    const mac = isMac()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (!allowInInputs && isTypingTarget(event.target)) return
      if (!shortcuts.some((s) => matchesShortcut(event, s, mac))) return
      if (preventDefault) event.preventDefault()
      handlerRef.current(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, enabled, allowInInputs, preventDefault])
}

const KEY_LABELS: Record<string, string> = {
  escape: 'Esc',
  enter: '↵',
  delete: 'Supr',
  backspace: '⌫',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  ' ': 'Espacio',
  tab: 'Tab',
}

/** Teclas para mostrar: 'mod+k' → ['⌘', 'K'] en Mac, ['Ctrl', 'K'] en el resto. */
export function formatShortcut(combo: string, mac = isMac()): string[] {
  const s = parseShortcut(combo)
  const keys: string[] = []
  if (s.mod) keys.push(mac ? '⌘' : 'Ctrl')
  if (s.alt) keys.push(mac ? '⌥' : 'Alt')
  if (s.shift) keys.push(mac ? '⇧' : 'Shift')
  keys.push(KEY_LABELS[s.key] ?? (s.key.length === 1 ? s.key.toUpperCase() : s.key))
  return keys
}
