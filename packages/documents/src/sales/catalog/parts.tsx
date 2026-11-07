/**
 * Piezas comunes del catálogo: contexto de dibujo, dibujo de ventana a la escala de su caja, muestras
 * de color con textura, glifos de apertura, precio «desde», QR y marca del taller. Sin hooks (el
 * render por tramos las puede llamar directo).
 */
import type { ReactNode } from 'react'
import type { Catalog, OpeningKind, WindowDesign } from '@dekopen/engine'
import type { DocLocale, DocTemplate, Formatter, Translator } from '@dekopen/shared'
import { WindowDrawing } from '../../drawing/WindowDrawing'
import type { DrawingDefsData } from '../../textures'
import type { DimensionMode } from '../../drawing/geometry'
import { mix, shade, luminance } from '../../base/color'
import type { DocOrg } from '../../base/types'
import { WorkshopQr } from '../../workshop/qr'
import type { CatalogDocData, CatalogDocTypology } from '../types'
import type { CatalogMessages } from './i18n'
import type { CatalogModel, FinishModel } from './model'
import { MM_PX, type CatalogMetrics } from './theme'

export interface CatalogRenderContext {
  /** Editor de plantillas: títulos escritos en la hoja. */
  onSectionEdit?: (sectionId: string, slot: 'title' | 'subtitle' | 'content', value: string) => void
  data: CatalogDocData
  template: DocTemplate
  metrics: CatalogMetrics
  model: CatalogModel
  locale: DocLocale
  t: Translator<CatalogMessages>
  fmt: Formatter
  /** Rótulo del impuesto («IVA», «MwSt.»…). */
  tax: string
  title: string
  /** Prefijo determinista de ids SVG del documento. */
  idPrefix: string
  /** Patrones de foliados de todos los dibujos del catálogo (una sola vez en el HTML). */
  drawingDefs: DrawingDefsData
  /** Texturas disponibles (`builtin:<id>` / `upload:<assetId>` → data URL). */
  textures: Readonly<Record<string, string>>
  /** Imagen subida por id (solo data URLs de imagen validadas). */
  asset: (id: string | undefined) => string | undefined
  /** Destino del QR de solicitud de cotización (URL https del taller), si existe. */
  requestUrl?: string
  /** Total de páginas. */
  pages: number
  /** Texto de la edición («octubre de 2026»). */
  edition?: string
}

// ── Seguridad de imágenes ────────────────────────────────────────────────────

const DATA_IMAGE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/

/** Solo data URLs de imagen rasterizada (nunca URLs remotas ni SVG): Chromium imprime sin red. */
export function safeImageSrc(value: unknown): string | undefined {
  return typeof value === 'string' && value.length < 12_000_000 && DATA_IMAGE.test(value) ? value : undefined
}

/** URL https/http para el QR (solo esquemas web; nunca javascript:, data: ni rutas relativas). */
export function safeWebUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!v || v.length > 300 || /\s/.test(v)) return undefined
  const withScheme = /^https?:\/\//i.test(v) ? v : /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(v) ? `https://${v}` : undefined
  if (!withScheme) return undefined
  try {
    const url = new URL(withScheme)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function displayUrl(url: string | undefined): string | undefined {
  return url?.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

// ── Dibujo ───────────────────────────────────────────────────────────────────

const EMPTY_CATALOG: Catalog = { colors: [], brands: [], lines: [], profiles: [], items: [], glass: [], brandSettings: [] }

export interface DrawingProps {
  /** Sin símbolos de apertura: portadas, donde la ventana se muestra y no se explica. */
  plain?: boolean
  ctx: CatalogRenderContext
  t: CatalogDocTypology
  /** Caja disponible en mm. */
  width: number
  height: number
  dims?: DimensionMode
  colorId?: string
  title?: string
  /** Estilo de la sección (`inherit` usa el del tema). */
  style?: 'inherit' | 'realistic' | 'technical'
}

/** Ventana dibujada por el motor, ajustada a su caja (mm) sin deformarse. */
export function Drawing({ ctx, t, width, height, dims = 'none', colorId, title, plain }: DrawingProps) {
  const design: WindowDesign = colorId ? { ...t.design, colorId, colorInId: undefined } : t.design
  // Sin cotas, la caja del SVG abraza la ventana (así se apoya en su línea de piso y no flota).
  let w = width
  let h = height
  const lw = t.layout?.width || t.design.width
  const lh = t.layout?.height || t.design.height
  if (dims === 'none' && lw > 0 && lh > 0) {
    const aspect = lw / lh
    if (w / h > aspect) w = h * aspect + 1
    else h = w / aspect + 1
  }
  return (
    <WindowDrawing
      layout={t.layout}
      design={design}
      catalog={ctx.data.catalog ?? EMPTY_CATALOG}
      width={Math.max(20, Math.round(Math.min(width, w) * MM_PX))}
      height={Math.max(20, Math.round(Math.min(height, h) * MM_PX))}
      dimensions={dims}
      title={title}
      locale={ctx.locale}
      defs={ctx.drawingDefs}
      {...(plain ? { symbols: false } : {})}
    />
  )
}

// ── Muestras de color ────────────────────────────────────────────────────────

export function textureKey(finish: Pick<FinishModel, 'color'>): string | undefined {
  const tex = finish.color.texture
  if (!tex) return undefined
  return tex.kind === 'builtin' ? `builtin:${tex.id}` : `upload:${tex.assetId}`
}

function hash(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

export function patternId(ctx: Pick<CatalogRenderContext, 'idPrefix'>, finish: FinishModel): string {
  return `${ctx.idPrefix}-f-${hash(`${finish.id}|${finish.hex}|${textureKey(finish) ?? ''}`)}`
}

/** Veta procedural determinista (respaldo cuando no hay tesela): líneas finas onduladas. */
function grainPaths(seed: string, w: number, h: number): string[] {
  let s = 0
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const out: string[] = []
  const lines = 18
  for (let i = 0; i < lines; i++) {
    const y0 = (i + rand() * 0.8) * (h / lines)
    const amp = 0.6 + rand() * 1.8
    const k = 1 + rand() * 2.5
    let d = `M0 ${y0.toFixed(2)}`
    for (let x = 4; x <= w; x += 4) {
      const y = y0 + Math.sin((x / w) * Math.PI * k + i) * amp
      d += `L${x} ${y.toFixed(2)}`
    }
    out.push(d)
  }
  return out
}

/**
 * Definiciones de las muestras del documento (una sola vez): una trama por color, con su tesela si
 * existe o una terminación procedural (veta, granulado, cepillado, liso) sobre el color de respaldo.
 */
export function FinishDefs({ ctx, finishes }: { ctx: CatalogRenderContext; finishes: readonly FinishModel[] }) {
  if (!finishes.length) return null
  return (
    <svg width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" focusable="false">
      <defs>
        {finishes.map((f) => {
          const id = patternId(ctx, f)
          const key = textureKey(f)
          const src = key ? safeImageSrc(ctx.textures[key]) : undefined
          const scale = Math.max(40, Math.min(1200, f.color.texture?.scaleMm ?? 300))
          if (src) {
            // La tesela representa `scaleMm` de material: en una muestra de ~40 mm se ve la veta real.
            const tile = Math.max(24, Math.min(160, scale / 6))
            return (
              <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={tile} height={tile}>
                <rect width={tile} height={tile} fill={f.hex} />
                <image href={src} width={tile} height={tile} preserveAspectRatio="none" />
              </pattern>
            )
          }
          const dark = luminance(f.hex) < 0.18
          const finish = f.finish ?? 'smooth'
          if (finish === 'woodgrain') {
            const paths = grainPaths(f.id, 120, 60)
            return (
              <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={120} height={60}>
                <rect width={120} height={60} fill={f.hex} />
                {paths.map((d, i) => (
                  <path key={i} d={d} fill="none" stroke={i % 3 === 0 ? shade(f.hex, 0.28) : mix(f.hex, '#FFFFFF', 0.16)} strokeWidth={i % 4 === 0 ? 0.9 : 0.45} strokeOpacity={0.55} />
                ))}
              </pattern>
            )
          }
          if (finish === 'metallic') {
            return (
              <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={60} height={8}>
                <rect width={60} height={8} fill={f.hex} />
                <path d="M0 1.5H60M0 4.2H60M0 6.6H60" stroke={mix(f.hex, '#FFFFFF', 0.35)} strokeWidth={0.35} strokeOpacity={0.7} />
                <path d="M0 3H60M0 7.4H60" stroke={shade(f.hex, 0.18)} strokeWidth={0.3} strokeOpacity={0.6} />
              </pattern>
            )
          }
          if (finish === 'textured') {
            return (
              <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={6} height={6}>
                <rect width={6} height={6} fill={f.hex} />
                <circle cx={1.2} cy={1.6} r={0.45} fill={mix(f.hex, '#FFFFFF', dark ? 0.16 : 0.3)} fillOpacity={0.8} />
                <circle cx={4.1} cy={3.9} r={0.4} fill={shade(f.hex, 0.25)} fillOpacity={0.7} />
                <circle cx={2.9} cy={5.1} r={0.3} fill={mix(f.hex, '#FFFFFF', 0.2)} fillOpacity={0.6} />
              </pattern>
            )
          }
          return (
            <linearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={mix(f.hex, '#FFFFFF', dark ? 0.12 : 0.22)} />
              <stop offset="0.55" stopColor={f.hex} />
              <stop offset="1" stopColor={shade(f.hex, dark ? 0.12 : 0.07)} />
            </linearGradient>
          )
        })}
      </defs>
    </svg>
  )
}

/** Muestra rectangular (como una muestra física) que llena su caja. */
export function Swatch({ ctx, finish, className, label }: { ctx: CatalogRenderContext; finish: FinishModel; className?: string; label?: string }) {
  const id = patternId(ctx, finish)
  return (
    <svg className={className ? `dkc-swatch ${className}` : 'dkc-swatch'} viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label ?? finish.name}>
      <rect width="100" height="100" fill={`url(#${id})`} />
      <rect x="0.5" y="0.5" width="99" height="99" fill="none" stroke="rgb(0 0 0 / 0.14)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Fila corta de muestras con nombre (opcional). */
export function SwatchRow({ ctx, finishes, names = false, max = 8 }: { ctx: CatalogRenderContext; finishes: readonly FinishModel[]; names?: boolean; max?: number }) {
  if (!finishes.length) return null
  const shown = finishes.slice(0, max)
  const rest = finishes.length - shown.length
  return (
    <div className={names ? 'dkc-chips dkc-chips--names' : 'dkc-chips'}>
      {shown.map((f) => (
        <span key={f.id} className="dkc-chip">
          <Swatch ctx={ctx} finish={f} className="dkc-chip__sw" />
          {names ? <span className="dkc-chip__name">{f.name}</span> : null}
        </span>
      ))}
      {rest > 0 ? <span className="dkc-chip dkc-chip--more">+{rest}</span> : null}
    </div>
  )
}

// ── Glifos de apertura ───────────────────────────────────────────────────────

/** Pictograma de una apertura (vista interior, convención DEKOPEN): líneas al lado de bisagras. */
export function OpeningGlyph({ kind, size = 9 }: { kind: OpeningKind | 'sliding'; size?: number }) {
  const s = `${size}mm`
  const frame = <rect x="3" y="3" width="26" height="26" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
  const dash = '3 2.2'
  let body: ReactNode = null
  switch (kind) {
    case 'fixed':
      body = <path d="M10 22 16 10 22 22" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0" />
      body = (
        <text x="16" y="20.5" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor">
          F
        </text>
      )
      break
    case 'casement':
    case 'door':
      body = <path d="M27 5 5 16 27 27" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray={dash} />
      break
    case 'tilt_turn':
      body = (
        <>
          <path d="M27 5 5 16 27 27" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray={dash} />
          <path d="M5 5 16 27 27 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray={dash} />
        </>
      )
      break
    case 'tilt':
      body = <path d="M5 5 16 27 27 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray={dash} />
      break
    case 'awning':
      body = <path d="M5 27 16 5 27 27" fill="none" stroke="currentColor" strokeWidth="1.2" />
      break
    case 'pivot_v':
      body = (
        <>
          <path d="M16 3V29" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.6" />
          <path d="M8 16h16M20 12l4 4-4 4M12 12l-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </>
      )
      break
    case 'pivot_h':
      body = (
        <>
          <path d="M3 16H29" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.6" />
          <path d="M16 8v16M12 12l4-4 4 4M12 20l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </>
      )
      break
    case 'tilt_slide':
    case 'parallel_slide':
      body = (
        <>
          {kind === 'tilt_slide' ? <path d="M5 5 16 22 27 5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeDasharray={dash} /> : null}
          <path d="M8 25.5h16M20 22.5l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </>
      )
      break
    case 'folding':
      body = <path d="M5 26 10.5 6 16 26 21.5 6 27 26" fill="none" stroke="currentColor" strokeWidth="1.2" />
      break
    case 'sliding':
      body = <path d="M8 16h16M20 12l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      break
  }
  return (
    <svg className="dkc-glyph" width={s} height={s} viewBox="0 0 32 32" aria-hidden="true">
      {frame}
      {body}
    </svg>
  )
}

// ── Precio y marca ───────────────────────────────────────────────────────────

/** «Desde $118.000/m²» o «Precio a consultar» (nunca un «desde» engañoso). */
export function FromPrice({ ctx, value, long = false, className }: { ctx: CatalogRenderContext; value?: number; long?: boolean; className?: string }) {
  if (!value || value <= 0) return <span className={`dkc-price dkc-price--ask${className ? ` ${className}` : ''}`}>{ctx.t('price.ask')}</span>
  return (
    <span className={`dkc-price${className ? ` ${className}` : ''}`}>
      <span className="dkc-price__from">{ctx.t('price.from')}</span> <span className="dkc-price__value">{ctx.fmt.money(value)}</span>
      <span className="dkc-price__unit">{long ? ` ${ctx.t('price.perM2Long', { tax: ctx.tax })}` : ctx.t('price.perM2')}</span>
    </span>
  )
}

/** Logo del taller (data URL) o su nombre en la tipografía del documento. */
export function OrgLogo({ org, className }: { org: DocOrg; className?: string }) {
  const src = safeImageSrc(org.logo)
  if (src) return <img className={`dkc-logo${className ? ` ${className}` : ''}`} src={src} alt={org.name} />
  return (
    <span className={`dkc-monogram${className ? ` ${className}` : ''}`}>{org.name}</span>
  )
}

/** QR de la solicitud de cotización (solo si hay una URL web del taller). */
export function RequestQr({ ctx, size, caption }: { ctx: CatalogRenderContext; size: number; caption?: string }) {
  if (!ctx.requestUrl) return null
  return (
    <figure className="dkc-qr">
      <WorkshopQr value={ctx.requestUrl} size={`${size}mm`} margin={2} title={caption ?? ctx.requestUrl} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  )
}

/** Líneas de contacto del taller (teléfono, correo, web) sin repetir lo vacío. */
export function contactParts(org: DocOrg): string[] {
  return [org.phone, org.email, displayUrl(safeWebUrl(org.website) ? org.website : undefined)].filter((s): s is string => !!s && !!s.trim())
}
