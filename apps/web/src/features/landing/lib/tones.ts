import type { DemoRef } from './cutDemo'

/** Un tono por ventana, como en la hoja de cortes impresa. */
export const REF_TONE: Record<DemoRef, { piece: string; dot: string }> = {
  V1: { piece: 'bg-ink-50 border-ink-100 text-ink-700', dot: 'bg-ink-500' },
  V2: { piece: 'bg-ok-50 border-ok-600/25 text-ok-800', dot: 'bg-ok-600' },
  V3: { piece: 'bg-warn-50 border-warn-600/25 text-warn-800', dot: 'bg-warn-600' },
}
