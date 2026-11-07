import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useT } from '../lib/i18n'
import { formatShortcut, isMac, parseShortcut } from '../lib/useShortcut'
import es from './i18n/es'

export interface KbdProps {
  /** Combinación a mostrar: 'mod+k' → ⌘ K (Mac) o Ctrl K. */
  combo?: string
  children?: ReactNode
  /** 'inverse' sobre fondos de acento o antracita (botón primario, tooltips, toasts): usa el color del texto. */
  tone?: 'default' | 'inverse'
  className?: string
}

const keyClass = {
  default: 'bg-pressed/80 text-fg-muted',
  inverse: 'bg-current/12 text-inherit',
}

/**
 * Teclas de una combinación con los nombres del idioma (Supr/Del/Entf, Ctrl/Strg, Espacio/Space…).
 * Los símbolos de Mac (⌘ ⌥ ⇧) y las flechas no se traducen.
 */
export function shortcutKeys(combo: string, t: (key: `keys.${keyof typeof es.keys}`) => string, mac = isMac()): string[] {
  const keys = formatShortcut(combo, mac)
  const parsed = parseShortcut(combo)
  let i = 0
  if (parsed.mod) keys[i++] = mac ? '⌘' : t('keys.ctrl')
  if (parsed.alt) keys[i++] = mac ? '⌥' : t('keys.alt')
  if (parsed.shift) keys[i++] = mac ? '⇧' : t('keys.shift')
  const last = keys.length - 1
  if (parsed.key === 'delete') keys[last] = t('keys.delete')
  else if (parsed.key === ' ') keys[last] = t('keys.space')
  else if (parsed.key === 'escape') keys[last] = t('keys.escape')
  return keys
}

/** Combinación como texto para usar dentro de una frase: «⌘J» en Mac, «Ctrl+J» / «Strg+J» en el resto. */
export function useShortcutText(combo: string): string {
  const t = useT(es)
  const mac = isMac()
  return shortcutKeys(combo, t, mac).join(mac ? '' : '+')
}

/** Tecla o combinación: tapa plana de 18 px, sin relieve. */
export function Kbd({ combo, children, tone = 'default', className }: KbdProps) {
  const t = useT(es)
  const keys = combo ? shortcutKeys(combo, t) : [children]
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={combo ? keys.join(' + ') : undefined}>
      {keys.map((key, i) => (
        <kbd
          key={i}
          className={cn(
            'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1 text-micro leading-none font-medium tabular',
            keyClass[tone],
          )}
        >
          <span className={tone === 'inverse' ? 'opacity-85' : undefined}>{key}</span>
        </kbd>
      ))}
    </span>
  )
}

export interface KbdHintProps {
  /** Combinación ('mod+k', 'enter'…) o teclas sueltas como hijos de Kbd. */
  combo?: string
  keys?: ReactNode
  /** Qué hace (texto traducido por quien llama): «buscar», «abrir». */
  children: ReactNode
  className?: string
}

/** Pista de teclado en línea: [⌘ K] buscar. Para pies de paletas, vacíos y barras. */
export function KbdHint({ combo, keys, children, className }: KbdHintProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-meta text-fg-muted', className)}>
      {combo ? <Kbd combo={combo} /> : <Kbd>{keys}</Kbd>}
      <span>{children}</span>
    </span>
  )
}
