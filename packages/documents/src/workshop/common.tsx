import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { Catalog, Warning, WorkshopWindow } from '@dekopen/engine'
import { WindowDrawing, type DimensionMode } from '../drawing'
import { RENDER_SLOT } from '../render'
import type { UnbackedLine } from './bars'
import { isOddAngle, otLabel, quoteLine, windowTitle } from './helpers'
import { fitWorkshopSheets } from './fit'
import { workshopI18n, type WorkshopI18n } from './locale'
import { workshopCss } from './styles'
import type { WorkshopDocumentData, WorkshopPaper } from './types'

const EMPTY_CATALOG: Catalog = { colors: [], brands: [], lines: [], profiles: [], items: [], glass: [], brandSettings: [] }

/**
 * Raíz de cada documento: estilos propios + contenedor. Salvo con `pageRule` propia (etiquetas),
 * las hojas que se pasarían a otra página por unas pocas filas se compactan al imprimir (ver
 * `fitWorkshopSheets`): en la web con este efecto y en el servidor con `WORKSHOP_FIT_SCRIPT`.
 */
export function DocRoot(props: {
  data: WorkshopDocumentData
  paper?: WorkshopPaper
  footer?: string
  pageRule?: string
  extraCss?: string
  kind: string
  w?: WorkshopI18n
  children: ReactNode
}) {
  const paper = props.paper ?? 'letter'
  const w = props.w ?? workshopI18n()
  const css = workshopCss({ paper, accent: props.data.org.accent, footer: props.footer, pageRule: props.pageRule, pageOf: w.t('common.pageOf', { page: '\u0001', pages: '\u0002' }) }) + (props.extraCss ?? '')
  const fit = !props.pageRule
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!fit || !el || typeof window === 'undefined') return
    const run = () => fitWorkshopSheets(el)
    run()
    let alive = true
    document.fonts?.ready.then(() => {
      if (alive) run()
    }, () => undefined)
    window.addEventListener('beforeprint', run)
    return () => {
      alive = false
      window.removeEventListener('beforeprint', run)
    }
  })
  return (
    <div ref={ref} className={`fzw-doc fzw-doc-${props.kind}`} data-paper={paper} data-document={props.kind} data-fit={fit ? '' : undefined} lang={w.lang}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {props.children}
    </div>
  )
}
// Las hojas (children) se dibujan tal cual: el servidor las arma de a una (ver renderStaticMarkupInSlices).
;(DocRoot as unknown as Record<symbol, boolean>)[RENDER_SLOT] = true

/** Una hoja en pantalla; al imprimir, un bloque que empieza en página nueva. */
export function Sheet(props: { children: ReactNode; footer?: string; footRight?: string; className?: string }) {
  return (
    <section className={`fzw-sheet${props.className ? ` ${props.className}` : ''}`}>
      {props.children}
      {props.footer || props.footRight ? (
        <footer className="fzw-foot">
          <span>{props.footer}</span>
          <span>{props.footRight}</span>
        </footer>
      ) : null}
    </section>
  )
}

/**
 * Cabecera común: taller a la izquierda, documento y OT a la derecha.
 * `audience: 'supplier'` (vidrios, compras) no muestra cliente, obra ni la fecha de
 * entrega al cliente: esos datos no son del proveedor.
 */
export function DocHeader(props: {
  data: WorkshopDocumentData
  kicker: string
  title?: string
  meta?: ReactNode
  audience?: 'internal' | 'supplier'
  w?: WorkshopI18n
}) {
  const { org, quote } = props.data
  const w = props.w ?? workshopI18n()
  const supplier = props.audience === 'supplier'
  const workOrder = supplier ? { ...props.data.workOrder, dueDate: undefined } : props.data.workOrder
  return (
    <header className="fzw-head">
      <div className="fzw-brand">
        {org.logo ? <img src={org.logo} alt={org.name} /> : null}
        <div>
          <div className="fzw-brand-name">{org.name}</div>
          {supplier ? null : (
            <div className="fzw-brand-sub">
              {quoteLine(props.data, w)}
              {quote.clientName ? ` · ${quote.clientName}` : ''}
            </div>
          )}
        </div>
      </div>
      <div className="fzw-head-right">
        <div className="fzw-head-kicker">{props.kicker}</div>
        <h1 className="fzw-head-title">{props.title ?? otLabel(props.data, w)}</h1>
        <div className="fzw-head-meta">
          {w.f.date(workOrder.date)}
          {workOrder.dueDate ? (
            <>
              {' · '}
              {w.t('common.delivery')} <strong>{w.f.shortDate(workOrder.dueDate)}</strong>
            </>
          ) : null}
          {props.meta ? <> · {props.meta}</> : null}
        </div>
      </div>
    </header>
  )
}

/** Banda de identificación de una ventana: V3 grande, nombre, medidas y unidades. */
export function WindowBand(props: { window: WorkshopWindow; small?: boolean; w?: WorkshopI18n }) {
  const { window } = props
  const w = props.w ?? workshopI18n()
  const { title, subtitle } = windowTitle(window, w)
  return (
    <div className="fzw-win">
      <span className={`fzw-ref${props.small ? ' fzw-ref-sm' : ''}`}>{window.ref}</span>
      <div>
        <div className="fzw-win-name">{title}</div>
        {subtitle ? <div className="fzw-win-desc">{subtitle}</div> : null}
      </div>
      <div className="fzw-win-size">
        <strong>{w.f.size(window.design.width, window.design.height)}</strong>
        <span className="fzw-qty-chip">{w.t('common.units', { count: window.qty })}</span>
      </div>
    </div>
  )
}

/**
 * Dibujo acotado de la ventana (vista interior), del módulo de dibujo compartido, en su versión
 * técnica (líneas limpias, sin texturas: se imprime en láser blanco y negro).
 * `width`/`height` son el máximo: se fija sólo el lado que limita y el otro sale de la
 * proporción, para no dejar huecos con ventanas apaisadas o puertas altas.
 */
export function WindowSketch(props: {
  window: WorkshopWindow
  catalog?: Catalog
  width: number
  height: number
  dimensions?: DimensionMode
}) {
  const { width: w, height: h } = props.window.design
  const byWidth = w > 0 && h > 0 && (h / w) * props.width <= props.height * 0.82
  return (
    <WindowDrawing
      layout={props.window.layout}
      design={props.window.design}
      catalog={props.catalog ?? EMPTY_CATALOG}
      view="interior"
      dimensions={props.dimensions ?? 'all'}
      {...TECHNICAL}
      {...(byWidth ? { width: props.width } : { height: props.height })}
    />
  )
}

/** Dibujo técnico explícito (el realista es para documentos de venta). */
const TECHNICAL = { render: 'technical' } as Record<string, unknown>

/** Casilla vacía para marcar a mano. `na` = no aplica. */
export function Box(props: { large?: boolean; na?: boolean; label?: string; w?: WorkshopI18n }) {
  const w = props.w ?? workshopI18n()
  const cls = `fzw-box${props.large ? ' fzw-box-lg' : ''}${props.na ? ' fzw-box-na' : ''}`
  return <span className={cls} role="img" aria-label={props.label ?? (props.na ? w.t('common.boxNa') : w.t('common.boxEmpty'))} />
}

/** Campo para escribir a mano: «Armó ________». */
export function WriteField(props: { label: string; className?: string }) {
  return (
    <span className={`fzw-write${props.className ? ` ${props.className}` : ''}`}>
      {props.label}
      <i />
    </span>
  )
}

export function Signatures(props: { labels: string[]; w?: WorkshopI18n }) {
  const w = props.w ?? workshopI18n()
  return (
    <div className="fzw-signs">
      {props.labels.map((label) => (
        <div key={label} className="fzw-sign">
          <span>{label}</span>
          <span>{w.t('common.date')}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Silueta de la pieza con sus cortes: recto a 90°, inglete a 45° y cualquier otro
 * ángulo dibujado tal cual. La cara larga queda abajo (cara exterior del perfil).
 */
export function CutShape(props: { start: number; end: number; width?: number; height?: number; w?: WorkshopI18n }) {
  const ws = props.w ?? workshopI18n()
  const w = props.width ?? 54
  const h = props.height ?? 13
  const inner = h - 2
  const offset = (angle: number) => {
    if (!Number.isFinite(angle) || angle >= 89.95 || angle <= 0.5) return 0
    return Math.min(inner / Math.tan((angle * Math.PI) / 180), w * 0.36)
  }
  const a = offset(props.start)
  const b = offset(props.end)
  const odd = isOddAngle(props.start) || isOddAngle(props.end)
  const points = [
    [1 + a, 1],
    [w - 1 - b, 1],
    [w - 1, h - 1],
    [1, h - 1],
  ]
    .map(([x, y]) => `${(x ?? 0).toFixed(2)},${(y ?? 0).toFixed(2)}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ws.t('common.cutAria', { start: ws.f.angle(props.start), end: ws.f.angle(props.end) })}>
      <polygon points={points} fill={odd ? '#FFF3D7' : '#F3F5F6'} stroke={odd ? '#855500' : '#1D2426'} strokeWidth={1.1} strokeLinejoin="round" />
    </svg>
  )
}

/** Ángulos en texto: «45° · 45°»; resalta los que no son 45°/90°. */
export function AngleText(props: { start: number; end: number; w?: WorkshopI18n }) {
  const w = props.w ?? workshopI18n()
  const odd = isOddAngle(props.start) || isOddAngle(props.end)
  const text = `${w.f.angle(props.start)} · ${w.f.angle(props.end)}`
  return odd ? <span className="fzw-tag">{text}</span> : <span className="fzw-small fzw-nowrap">{text}</span>
}

/** Líneas cuyos cortes no tienen respaldo del fabricante: se dice en la hoja, no se aparenta. */
export function UnbackedNote(props: { lines: UnbackedLine[]; w: WorkshopI18n }) {
  const { lines, w } = props
  if (lines.length === 0) return null
  return (
    <div className="fzw-callout fzw-callout-info" role="note">
      <div className="fzw-callout-title">{w.t('cuts.unbackedTitle')}</div>
      <ul>
        {lines.map((line) => (
          <li key={line.name}>
            <strong>{line.name}</strong>: {w.t(`cuts.origin.${line.origin}`)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Avisos del motor en lenguaje de taller (en el idioma del documento). */
export function WarningsCallout(props: { warnings: Warning[]; title?: string; w?: WorkshopI18n }) {
  const w = props.w ?? workshopI18n()
  if (props.warnings.length === 0) return null
  const hasError = props.warnings.some((x) => x.level === 'error')
  const onlyInfo = props.warnings.every((x) => x.level === 'info')
  const tone = hasError ? ' fzw-callout-bad' : onlyInfo ? ' fzw-callout-info' : ''
  return (
    <div className={`fzw-callout${tone}`} role="note">
      <div className="fzw-callout-title">{props.title ?? w.t('common.reviewBeforeMaking')}</div>
      <ul>
        {props.warnings.map((x, i) => (
          <li key={`${x.code}-${i}`}>{w.warning(x)}</li>
        ))}
      </ul>
    </div>
  )
}

/** Barra de proporción simple (aprovechamiento, familias de costo). */
export function Meter(props: { pct: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, props.pct))
  return (
    <div className="fzw-meter" role="img" aria-label={props.label ?? `${Math.round(pct)} %`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}
