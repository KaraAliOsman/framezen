/**
 * Nombres de colores del catálogo en el idioma de quien lee (interfaz, portal y documentos).
 *
 * Los catálogos vienen en español («Blanco», «Nogal», «Roble dorado», «Antracita»…). Un nombre
 * CONOCIDO se traduce: el de la biblioteca integrada de texturas (`BUILTIN_TEXTURES`, 7 idiomas)
 * cuando el color usa esa textura o se llama igual, o el de la tabla de nombres habituales de
 * foliados y colores lisos. Los colores propios del taller (`custom-…`) y cualquier nombre que no se
 * reconozca se muestran tal como se escribieron.
 *
 * La búsqueda reconoce el nombre en cualquiera de los 7 idiomas, así que re-localizar un texto ya
 * traducido («Walnut» → «Nussbaum») también funciona.
 */
import type { Locale } from '../i18n/locales'
import { BUILTIN_TEXTURES, isBuiltinTextureId, type TextureNames } from './index'
import { isCustomColorId } from './custom'

/** Nombres habituales de colores y foliados que no son de la biblioteca integrada. */
const KNOWN_COLOR_NAMES: readonly TextureNames[] = [
  { es: 'Blanco', en: 'White', pt: 'Branco', fr: 'Blanc', de: 'Weiß', it: 'Bianco', tr: 'Beyaz' },
  { es: 'Negro', en: 'Black', pt: 'Preto', fr: 'Noir', de: 'Schwarz', it: 'Nero', tr: 'Siyah' },
  { es: 'Negro mate', en: 'Matt black', pt: 'Preto fosco', fr: 'Noir mat', de: 'Schwarz matt', it: 'Nero opaco', tr: 'Mat siyah' },
  { es: 'Gris', en: 'Grey', pt: 'Cinza', fr: 'Gris', de: 'Grau', it: 'Grigio', tr: 'Gri' },
  { es: 'Antracita', en: 'Anthracite', pt: 'Antracite', fr: 'Anthracite', de: 'Anthrazit', it: 'Antracite', tr: 'Antrasit' },
  { es: 'Gris antracita', en: 'Anthracite grey', pt: 'Cinza antracite', fr: 'Gris anthracite', de: 'Anthrazitgrau', it: 'Grigio antracite', tr: 'Antrasit gri' },
  { es: 'Grafito', en: 'Graphite', pt: 'Grafite', fr: 'Graphite', de: 'Graphit', it: 'Grafite', tr: 'Grafit' },
  { es: 'Crema', en: 'Cream', pt: 'Creme', fr: 'Crème', de: 'Creme', it: 'Crema', tr: 'Krem' },
  { es: 'Plata', en: 'Silver', pt: 'Prata', fr: 'Argent', de: 'Silber', it: 'Argento', tr: 'Gümüş' },
  { es: 'Nogal oscuro', en: 'Dark walnut', pt: 'Nogueira escura', fr: 'Noyer foncé', de: 'Nussbaum dunkel', it: 'Noce scuro', tr: 'Koyu ceviz' },
  { es: 'Nogal claro', en: 'Light walnut', pt: 'Nogueira clara', fr: 'Noyer clair', de: 'Nussbaum hell', it: 'Noce chiaro', tr: 'Açık ceviz' },
  { es: 'Roble', en: 'Oak', pt: 'Carvalho', fr: 'Chêne', de: 'Eiche', it: 'Rovere', tr: 'Meşe' },
  { es: 'Roble natural', en: 'Natural oak', pt: 'Carvalho natural', fr: 'Chêne naturel', de: 'Eiche natur', it: 'Rovere naturale', tr: 'Doğal meşe' },
  { es: 'Roble gris', en: 'Grey oak', pt: 'Carvalho cinza', fr: 'Chêne gris', de: 'Eiche grau', it: 'Rovere grigio', tr: 'Gri meşe' },
  { es: 'Roble montaña', en: 'Mountain oak', pt: 'Carvalho montanha', fr: 'Chêne montagne', de: 'Bergeiche', it: 'Rovere montagna', tr: 'Dağ meşesi' },
  { es: 'Winchester', en: 'Winchester', pt: 'Winchester', fr: 'Winchester', de: 'Winchester', it: 'Winchester', tr: 'Winchester' },
  { es: 'Wengué', en: 'Wenge', pt: 'Wengué', fr: 'Wengé', de: 'Wenge', it: 'Wengé', tr: 'Wenge' },
  { es: 'Acero inoxidable', en: 'Stainless steel', pt: 'Aço inoxidável', fr: 'Acier inoxydable', de: 'Edelstahl', it: 'Acciaio inox', tr: 'Paslanmaz çelik' },
  { es: 'Aluminio mate', en: 'Matt aluminium', pt: 'Alumínio fosco', fr: 'Aluminium mat', de: 'Aluminium matt', it: 'Alluminio opaco', tr: 'Mat alüminyum' },
  { es: 'Titanio', en: 'Titanium', pt: 'Titânio', fr: 'Titane', de: 'Titan', it: 'Titanio', tr: 'Titanyum' },
  { es: 'Peltre', en: 'Pewter', pt: 'Estanho', fr: 'Étain', de: 'Zinn', it: 'Peltro', tr: 'Kalay' },
  { es: 'Bronce', en: 'Bronze', pt: 'Bronze', fr: 'Bronze', de: 'Bronze', it: 'Bronzo', tr: 'Bronz' },
]

/** Clave de comparación: minúsculas, sin tildes ni signos, espacios simples. */
function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

let index: Map<string, TextureNames> | null = null

/** Nombre en cualquier idioma → sus 7 nombres (la biblioteca integrada manda sobre la tabla). */
function nameIndex(): Map<string, TextureNames> {
  if (index) return index
  const out = new Map<string, TextureNames>()
  const add = (names: TextureNames) => {
    for (const value of Object.values(names)) {
      const key = nameKey(value)
      if (key && !out.has(key)) out.set(key, names)
    }
  }
  // Primero los nombres en español (la lengua de los catálogos), después los demás idiomas.
  for (const t of Object.values(BUILTIN_TEXTURES)) add({ ...t.names })
  for (const names of KNOWN_COLOR_NAMES) add(names)
  index = out
  return out
}

export interface NamedColor {
  id?: string
  name: string
  texture?: { kind: string; id?: string } | null
}

/**
 * Nombre visible de un color del catálogo en `locale`. Colores propios y nombres desconocidos:
 * tal cual. Español: el nombre del catálogo sin tocar.
 */
export function colorDisplayName(color: NamedColor, locale: Locale): string {
  const name = color.name ?? ''
  if (!name.trim() || (color.id && isCustomColorId(color.id))) return name
  const key = nameKey(name)
  // Textura integrada con el mismo nombre (en cualquier idioma): sus nombres oficiales.
  const texture = color.texture
  if (texture?.kind === 'builtin' && isBuiltinTextureId(texture.id)) {
    const names = BUILTIN_TEXTURES[texture.id].names
    if (Object.values(names).some((n) => nameKey(n) === key)) return locale === 'es' && nameKey(names.es) === key ? name : names[locale]
  }
  const names = nameIndex().get(key)
  if (!names) return name
  // En español se respeta lo que trae el catálogo (mayúsculas, tildes) si ya es el nombre español.
  if (locale === 'es' && nameKey(names.es) === key) return name
  return names[locale]
}

/** Copia del catálogo con los nombres de colores en `locale` (mismo objeto si nada cambia). */
export function localizeCatalogColors<C extends { colors: readonly NamedColor[] }>(catalog: C, locale: Locale): C {
  let changed = false
  const colors = catalog.colors.map((c) => {
    const name = colorDisplayName(c, locale)
    if (name === c.name) return c
    changed = true
    return { ...c, name }
  })
  return changed ? { ...catalog, colors } : catalog
}
