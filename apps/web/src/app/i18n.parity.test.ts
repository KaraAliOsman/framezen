import '../../test/setup'
import { describe, expect, it } from 'vitest'

/**
 * Paridad de los 7 idiomas en las carpetas de UI-A (shell, kit, inicio, bienvenida, acceso, ajustes,
 * landing y portal). tsc ya obliga a que estén todas las claves; aquí se comprueba lo que tsc no ve:
 * que cada traducción conserva los parámetros `{…}` y las etiquetas `<b>…</b>` del español, que los
 * plurales traen `other` y que no queda ningún texto vacío.
 */
const LOCALES = ['es', 'en', 'pt', 'fr', 'de', 'it', 'tr'] as const
const FOLDERS = ['app', 'ui', 'features/home', 'features/clients', 'features/workshop', 'features/onboarding', 'features/auth', 'features/settings', 'features/landing', 'features/portal']

const modules = import.meta.glob<{ default: Record<string, unknown> }>(
  [
    '../app/i18n/*.ts',
    '../ui/i18n/*.ts',
    '../features/home/i18n/*.ts',
    '../features/clients/i18n/*.ts',
    '../features/workshop/i18n/*.ts',
    '../features/onboarding/i18n/*.ts',
    '../features/auth/i18n/*.ts',
    '../features/settings/i18n/*.ts',
    '../features/landing/i18n/*.ts',
    '../features/portal/i18n/*.ts',
  ],
  { eager: true },
)

/** Vite normaliza `../app/i18n/es.ts` (desde `src/app`) a `./i18n/es.ts`: se vuelve a una ruta desde `src`. */
const bySrcPath = new Map(Object.entries(modules).map(([key, mod]) => [key.replace(/^\.\.\//, '').replace(/^\.\//, 'app/'), mod.default]))

function dictionary(folder: string, locale: string): Record<string, unknown> | undefined {
  return bySrcPath.get(`${folder}/i18n/${locale}.ts`)
}

function flatten(tree: Record<string, unknown>, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else if (value && typeof value === 'object') flatten(value as Record<string, unknown>, path, out)
  }
  return out
}

/** Parámetros de un mensaje ICU-lite (recorre también el cuerpo de plural/select). */
function params(message: string, found = new Set<string>()): Set<string> {
  let i = 0
  while (i < message.length) {
    if (message[i] !== '{') {
      i++
      continue
    }
    let depth = 1
    let j = i + 1
    while (j < message.length && depth > 0) {
      if (message[j] === '{') depth++
      else if (message[j] === '}') depth--
      j++
    }
    const body = message.slice(i + 1, j - 1)
    const comma = body.indexOf(',')
    if (comma === -1) found.add(body.trim())
    else {
      found.add(body.slice(0, comma).trim())
      // Ramas: «clave {mensaje}».
      const rest = body.slice(comma + 1)
      const branch = /(?:^|\s)(?:=\d+|[a-z]+)\s*\{/g
      for (const match of rest.matchAll(branch)) {
        const start = (match.index ?? 0) + match[0].length - 1
        let d = 0
        let k = start
        do {
          if (rest[k] === '{') d++
          else if (rest[k] === '}') d--
          k++
        } while (k < rest.length && d > 0)
        params(rest.slice(start + 1, k - 1), found)
      }
    }
    i = j
  }
  found.delete('#')
  found.delete('')
  return found
}

function tags(message: string): string[] {
  return [...message.matchAll(/<\/?[a-z][a-z0-9]*\s*\/?>/gi)].map((m) => m[0].toLowerCase().replace(/\s+/g, '')).sort()
}

describe.each(FOLDERS)('idiomas de %s', (folder) => {
  const source = dictionary(folder, 'es')
  const sourceFlat = source ? flatten(source) : new Map<string, string>()

  it('tiene el español como fuente', () => {
    expect(source).toBeTruthy()
    expect(sourceFlat.size).toBeGreaterThan(5)
  })

  it.each(LOCALES.filter((l) => l !== 'es'))('%s: mismas claves, mismos parámetros y etiquetas, sin textos vacíos', (locale) => {
    const dict = dictionary(folder, locale)
    expect(dict, `falta ${folder}/i18n/${locale}.ts`).toBeTruthy()
    const flat = flatten(dict ?? {})
    expect([...flat.keys()].sort()).toEqual([...sourceFlat.keys()].sort())
    const problems: string[] = []
    for (const [key, esText] of sourceFlat) {
      const text = flat.get(key) ?? ''
      if (!text.trim()) problems.push(`${key}: vacío`)
      const want = [...params(esText)].sort().join(',')
      const got = [...params(text)].sort().join(',')
      if (want !== got) problems.push(`${key}: parámetros {${got}} en vez de {${want}}`)
      if (tags(esText).join('') !== tags(text).join('')) problems.push(`${key}: etiquetas ${tags(text).join('')} en vez de ${tags(esText).join('')}`)
      if (/plural,/.test(text) && !/other\s*\{/.test(text)) problems.push(`${key}: plural sin «other»`)
    }
    expect(problems).toEqual([])
  })
})

describe('lector de mensajes de la prueba', () => {
  it('encuentra parámetros dentro de plurales y selecciones, y etiquetas', () => {
    expect([...params('{count, plural, one {# ventana de {name}} other {# ventanas}} · {when}')].sort()).toEqual(['count', 'name', 'when'])
    expect([...params('{kind, select, door {Puerta} other {Ventana}}')]).toEqual(['kind'])
    expect(tags('Hola <b>{name}</b><br/>')).toEqual(['</b>', '<b>', '<br/>'])
  })
})
