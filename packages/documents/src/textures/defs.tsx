/**
 * `<pattern>` de foliados para el dibujo (en mm: cada dibujo pinta sus piezas en milímetros, así que una
 * misma definición sirve para todos los dibujos de un documento sin importar su escala).
 *
 * - Un dibujo suelto emite sus propios patrones con ids únicos (useId).
 * - Un documento con muchos dibujos usa `createDrawingDefs` + `<DrawingDefsSvg>` una vez arriba, y pasa
 *   `defs` a cada `WindowDrawing` (o lo provee con `DrawingDefsProvider`): la tesela (data URL) viaja una
 *   sola vez en el HTML del PDF.
 * - `TextureProvider` entrega a los dibujos las texturas subidas por el taller (data URL de la API).
 */
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import type { Catalog, WindowDesign } from '@dekopen/engine'
import { environmentHref, type GlassEnvironment } from './environment'
import { builtinTextureHref, builtinTexturesReady, builtinTexturesVersion, loadBuiltinTextures, subscribeBuiltinTextures } from './loader'
import type { BuiltinTextureId } from './registry'
import { appearanceForColorId, builtinIdsOf, type ColorAppearance, type TextureSources } from './resolve'

// ── Patrón de una apariencia ─────────────────────────────────────────────────

function hashKey(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** ¿La apariencia necesita patrón? (lisos sin imagen se pintan con su hex). */
export function needsPattern(a: ColorAppearance): boolean {
  return Boolean(a.href) || a.finish === 'woodgrain' || a.finish === 'metallic'
}

/** ¿El dibujo usa su foliado? Un liso integrado es su color: la micro-tesela no aporta y pesa. */
export function usesTexture(a: ColorAppearance): boolean {
  return a.source?.kind === 'upload' ? true : a.finish !== 'smooth' && needsPattern(a)
}

/** Tamaño físico (mm) de una repetición. */
export function patternSize(a: ColorAppearance): { w: number; h: number } {
  const w = Math.max(20, a.scaleMm)
  return { w, h: Math.max(10, w * a.aspect) }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Veta vectorial de respaldo (mientras carga la tesela o si no hay imagen): líneas finas, sin filtros. */
function VectorGrain({ a, w, h }: { a: ColorAppearance; w: number; h: number }) {
  const rnd = (() => {
    let s = hashKey(a.key) || 1
    return () => {
      s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
      return s / 4294967296
    }
  })()
  const metallic = a.finish === 'metallic'
  const lines: ReactNode[] = []
  const count = metallic ? 28 : 16
  for (let i = 0; i < count; i++) {
    const y = ((i + 0.5) / count) * h + (rnd() - 0.5) * (h / count) * 0.6
    const d1 = (rnd() - 0.5) * h * (metallic ? 0.01 : 0.12)
    const d2 = (rnd() - 0.5) * h * (metallic ? 0.01 : 0.12)
    const width = metallic ? 0.25 + rnd() * 0.5 : 0.5 + rnd() * 1.6
    const dark = metallic ? rnd() > 0.5 : rnd() > 0.25
    lines.push(
      <path
        key={i}
        d={`M0 ${r2(y)}C${r2(w * 0.3)} ${r2(y + d1)} ${r2(w * 0.7)} ${r2(y + d2)} ${r2(w)} ${r2(y)}`}
        fill="none"
        stroke={dark ? a.dark : a.light}
        strokeOpacity={metallic ? 0.35 : dark ? r2(0.28 + rnd() * 0.22) : 0.3}
        strokeWidth={r2(width)}
      />,
    )
  }
  return <>{lines}</>
}

/** La apariencia con la tesela integrada si ya llegó a la caché. */
export function withLoadedHref(a: ColorAppearance): ColorAppearance {
  if (a.href || a.source?.kind !== 'builtin') return a
  const href = builtinTextureHref(a.source.id)
  return href ? { ...a, href } : a
}

/**
 * Definición del foliado de una apariencia. Con imagen es una tesela de 1 × 1 que cada pieza escala y
 * recorta (`drawing/tiles.tsx`); sin imagen, un `<pattern>` de veta vectorial mientras llega.
 */
export function TexturePattern({ id, appearance: a }: { id: string; appearance: ColorAppearance }) {
  if (a.href) {
    return (
      <g id={id} data-texture={a.key}>
        <image href={a.href} width={1} height={1} preserveAspectRatio="none" />
        {a.tint > 0 ? <rect width={1} height={1} fill={a.hex} fillOpacity={a.tint} /> : null}
      </g>
    )
  }
  const { w, h } = patternSize(a)
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse" width={r2(w)} height={r2(h)} data-texture={a.key}>
      <rect width={r2(w)} height={r2(h)} fill={a.hex} />
      <VectorGrain a={a} w={w} h={h} />
    </pattern>
  )
}

/** Entorno del vidrio: una imagen de 1 × 1 que cada paño escala a la ventana con `<use>`. */
export function EnvironmentImage({ id, environment }: { id: string; environment: GlassEnvironment }) {
  return <image id={id} href={environmentHref(environment)} width={1} height={1} preserveAspectRatio="none" />
}

// ── Texturas subidas (contexto) ──────────────────────────────────────────────

const TextureContext = createContext<TextureSources | undefined>(undefined)

/** Entrega a los dibujos las texturas subidas (y teselas integradas ya resueltas, si las hay). */
export function TextureProvider({ sources, children }: { sources: TextureSources | undefined; children?: ReactNode }) {
  return <TextureContext.Provider value={sources}>{children}</TextureContext.Provider>
}

export function useTextureSources(): TextureSources | undefined {
  return useContext(TextureContext)
}

/**
 * Carga en segundo plano las teselas integradas que faltan y redibuja al llegar (navegador). En un
 * render estático no hace nada: el servidor debe `await loadBuiltinTextures()` antes de dibujar.
 */
export function useBuiltinTextures(ids: readonly BuiltinTextureId[]): number {
  const version = useSyncExternalStore(subscribeBuiltinTextures, builtinTexturesVersion, builtinTexturesVersion)
  const key = [...ids].sort().join(',')
  useEffect(() => {
    if (ids.length && !builtinTexturesReady(ids)) void loadBuiltinTextures(ids)
    // `key` resume `ids` (el arreglo cambia de identidad en cada dibujo).
  }, [key])
  return version
}

// ── Definiciones compartidas por documento ───────────────────────────────────

export interface DrawingDefsData {
  /** Prefijo de los ids (`dkd` por defecto). */
  prefix: string
  /** Apariencias con patrón, por clave. */
  appearances: ReadonlyMap<string, ColorAppearance>
}

export interface CreateDrawingDefsInput {
  designs: readonly Pick<WindowDesign, 'colorId' | 'colorInId'>[]
  catalog: Pick<Catalog, 'colors'>
  textures?: TextureSources
  prefix?: string
}

/** Patrones que necesitan todos los dibujos de un documento (interior y exterior de cada diseño). */
export function createDrawingDefs({ designs, catalog, textures, prefix = 'dkd' }: CreateDrawingDefsInput): DrawingDefsData {
  const appearances = new Map<string, ColorAppearance>()
  for (const design of designs) {
    for (const colorId of [design.colorId, design.colorInId ?? design.colorId]) {
      const a = appearanceForColorId(colorId, catalog.colors, textures)
      if (usesTexture(a)) appearances.set(a.key, a)
    }
  }
  return { prefix: prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'dkd', appearances }
}

/** Foliados integrados que conviene precargar antes de un render estático. */
export function drawingDefsBuiltinIds(defs: DrawingDefsData): BuiltinTextureId[] {
  return builtinIdsOf([...defs.appearances.values()])
}

export function patternIdFor(defs: DrawingDefsData, key: string): string {
  return `${defs.prefix}-${key}`
}

export function environmentIdFor(defs: DrawingDefsData, environment: GlassEnvironment): string {
  return `${defs.prefix}-env-${environment}`
}

/**
 * SVG oculto con los patrones del documento. Va una vez, antes del primer dibujo. No usa
 * `display:none` (Chromium no pinta patrones definidos en un SVG sin caja).
 */
export function DrawingDefsSvg({ defs }: { defs: DrawingDefsData }) {
  useBuiltinTextures(drawingDefsBuiltinIds(defs))
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} data-drawing-defs={defs.prefix}>
      <defs>
        {[...defs.appearances.values()].map((a) => (
          <TexturePattern key={a.key} id={patternIdFor(defs, a.key)} appearance={withLoadedHref(a)} />
        ))}
        <EnvironmentImage id={environmentIdFor(defs, 'outdoor')} environment="outdoor" />
        <EnvironmentImage id={environmentIdFor(defs, 'reflection')} environment="reflection" />
      </defs>
    </svg>
  )
}

const DrawingDefsContext = createContext<DrawingDefsData | undefined>(undefined)

/** Comparte las definiciones con los dibujos de abajo (web). En documentos, preferir la prop `defs`. */
export function DrawingDefsProvider({ value, children }: { value: DrawingDefsData | undefined; children?: ReactNode }) {
  return <DrawingDefsContext.Provider value={value}>{children}</DrawingDefsContext.Provider>
}

export function useDrawingDefs(): DrawingDefsData | undefined {
  return useContext(DrawingDefsContext)
}
