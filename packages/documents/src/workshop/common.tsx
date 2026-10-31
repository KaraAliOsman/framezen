import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { Catalog, Warning, WorkshopWindow } from '@framezen/engine'
import { WindowDrawing, type DimensionMode } from '../drawing'
import { RENDER_SLOT } from '../render'
import { fmtAngle, fmtDate, fmtShortDate, fmtSize, plural } from './format'
import { isOddAngle, otLabel, quoteLine, windowTitle } from './helpers'
import { fitWorkshopSheets } from './fit'
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
  children: ReactNode
}) {
  const paper = props.paper ?? 'letter'
  const css = workshopCss({ paper, accent: props.data.org.accent, footer: props.footer, pageRule: props.pageRule }) + (props.extraCss ?? '')
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
    <div ref={ref} className={`fzw-doc fzw-doc-${props.kind}`} data-paper={paper} data-document={props.kind} data-fit={fit ? '' : undefined} lang="es-CL">
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
}) {
  const { org, quote } = props.data
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
              {quoteLine(props.data)}
              {quote.clientName ? ` · ${quote.clientName}` : ''}
            </div>
          )}
        </div>
      </div>
      <div className="fzw-head-right">
        <div className="fzw-head-kicker">{props.kicker}</div>
        <h1 className="fzw-head-title">{props.title ?? otLabel(props.data)}</h1>
        <div className="fzw-head-meta">
          {fmtDate(workOrder.date)}
          {workOrder.dueDate ? (
            <>
              {' · '}Entrega <strong>{fmtShortDate(workOrder.dueDate)}</strong>
            </>
          ) : null}
          {props.meta ? <> · {props.meta}</> : null}
        </div>
      </div>
    </header>
  )
}

/** Banda de identificación de una ventana: V3 grande, nombre, medidas y unidades. */
export function WindowBand(props: { window: WorkshopWindow; small?: boolean }) {
  const { window } = props
  const { title, subtitle } = windowTitle(window)
  return (
    <div className="fzw-win">
      <span className={`fzw-ref${props.small ? ' fzw-ref-sm' : ''}`}>{window.ref}</span>
      <div>
        <div className="fzw-win-name">{title}</div>
        {subtitle ? <div className="fzw-win-desc">{subtitle}</div> : null}
      </div>
      <div className="fzw-win-size">
        <strong>{fmtSize(window.design.width, window.design.height)}</strong>
        <span className="fzw-qty-chip">{plural(window.qty, 'unidad', 'unidades')}</span>
      </div>
    </div>
  )
}

/**
 * Dibujo acotado de la ventana (vista interior), del módulo de dibujo compartido.
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
      {...(byWidth ? { width: props.width } : { height: props.height })}
    />
  )
}

/** Casilla vacía para marcar a mano. `na` = no aplica. */
export function Box(props: { large?: boolean; na?: boolean; label?: string }) {
  const cls = `fzw-box${props.large ? ' fzw-box-lg' : ''}${props.na ? ' fzw-box-na' : ''}`
  return <span className={cls} role="img" aria-label={props.label ?? (props.na ? 'No aplica' : 'Casilla para marcar')} />
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

export function Signatures(props: { labels: string[] }) {
  return (
    <div className="fzw-signs">
      {props.labels.map((label) => (
        <div key={label} className="fzw-sign">
          <span>{label}</span>
          <span>Fecha</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Silueta de la pieza con sus cortes: recto a 90°, inglete a 45° y cualquier otro
 * ángulo dibujado tal cual. La cara larga queda abajo (cara exterior del perfil).
 */
export function CutShape(props: { start: number; end: number; width?: number; height?: number }) {
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
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`Corte ${fmtAngle(props.start)} y ${fmtAngle(props.end)}`}
    >
      <polygon
        points={points}
        fill={odd ? '#FBF0DC' : '#F4F1EC'}
        stroke={odd ? '#A35F00' : '#1F1C18'}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Ángulos en texto: «45° · 45°»; resalta los que no son 45°/90°. */
export function AngleText(props: { start: number; end: number }) {
  const odd = isOddAngle(props.start) || isOddAngle(props.end)
  const text = `${fmtAngle(props.start)} · ${fmtAngle(props.end)}`
  return odd ? <span className="fzw-tag">{text}</span> : <span className="fzw-small fzw-nowrap">{text}</span>
}

/** Avisos del motor en lenguaje de taller. */
export function WarningsCallout(props: { warnings: Warning[]; title?: string }) {
  if (props.warnings.length === 0) return null
  const hasError = props.warnings.some((w) => w.level === 'error')
  const onlyInfo = props.warnings.every((w) => w.level === 'info')
  const tone = hasError ? ' fzw-callout-bad' : onlyInfo ? ' fzw-callout-info' : ''
  return (
    <div className={`fzw-callout${tone}`} role="note">
      <div className="fzw-callout-title">{props.title ?? 'Revisa antes de fabricar'}</div>
      <ul>
        {props.warnings.map((w, i) => (
          <li key={`${w.code}-${i}`}>{w.message}</li>
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
