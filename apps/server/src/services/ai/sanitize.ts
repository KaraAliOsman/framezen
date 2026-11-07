/**
 * Algunos modelos mezclan marcas internas en el texto visible, como `<ds_safety>…</ds_safety>Safe`.
 * Nunca deben llegar a la persona ni al historial. El filtro de flujo retiene lo justo para
 * reconocer la marca aunque venga partida en varios trozos.
 */
const OPEN = '<ds_'
const VERDICT = /^\s*(?:safe|unsafe)\b/i
const BLOCK = /<(ds_[a-z_]+)>[\s\S]*?<\/\1>\s*(?:safe\b|unsafe\b)?/gi
const UNCLOSED = /<ds_[a-z_]*>?[\s\S]*$/i

export function stripProviderMarkup(text: string): string {
  if (!text.toLowerCase().includes(OPEN)) return text
  return text.replace(BLOCK, '').replace(UNCLOSED, '').trim()
}

/** ¿El final del texto puede ser el comienzo de una marca? Devuelve desde dónde retener. */
function holdFrom(text: string): number {
  const at = text.lastIndexOf('<')
  if (at < 0) return -1
  const tail = text.slice(at).toLowerCase()
  return OPEN.startsWith(tail) || tail.startsWith(OPEN) ? at : -1
}

export interface ContentFilter {
  push(text: string): void
  flush(): void
}

export function createContentFilter(write: (text: string) => void): ContentFilter {
  let pending = ''
  /** Tras cerrar una marca puede venir su veredicto («Safe»), que tampoco se muestra. */
  let afterBlock = false

  const drain = (final: boolean) => {
    for (;;) {
      if (afterBlock) {
        if (!final && pending.trim().length < 6) return
        pending = pending.replace(VERDICT, '').replace(/^\s+/, '')
        afterBlock = false
      }
      const open = pending.toLowerCase().indexOf(OPEN)
      if (open >= 0) {
        if (open > 0) write(pending.slice(0, open))
        pending = pending.slice(open)
        const name = /^<(ds_[a-z_]+)>/i.exec(pending)?.[1]
        const end = name ? pending.toLowerCase().indexOf(`</${name.toLowerCase()}>`) : -1
        if (end < 0) {
          if (final) pending = ''
          return
        }
        pending = pending.slice(end + name!.length + 3)
        afterBlock = true
        continue
      }
      const hold = final ? -1 : holdFrom(pending)
      const visible = hold >= 0 ? pending.slice(0, hold) : pending
      if (visible) write(visible)
      pending = hold >= 0 ? pending.slice(hold) : ''
      return
    }
  }

  return {
    push(text) {
      pending += text
      drain(false)
    },
    flush() {
      drain(true)
    },
  }
}
