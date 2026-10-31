import type { CSSProperties, ReactNode } from 'react'
import type { Glass, QuoteExtra, QuoteTotals } from '@framezen/engine'
import { clsx } from './clsx'
import { documentCss } from './css'
import { formatArea, formatClp, formatDateLong, formatMeasure, formatMm, formatNumber, formatPct, initials, joinParts } from './format'
import { paymentSchedule } from './text'
import { themeVars, type DocTheme } from './theme'
import type { DocMeta, DocOrg } from './types'

// ── Raíz y hojas ──────────────────────────────────────────────────────────────

/** Inyecta el CSS de documentos (úsalo una vez por pantalla en la web). */
export function DocumentStyles({ theme, extraCss }: { theme: DocTheme; extraCss?: string }) {
  return <style dangerouslySetInnerHTML={{ __html: documentCss(theme, extraCss) }} />
}

export interface DocRootProps {
  theme: DocTheme
  children: ReactNode
  className?: string
  /** Incluye <style> con el CSS (vista previa aislada). En PDF lo pone renderDocumentHtml. */
  withStyles?: boolean
  /** Nombre accesible del documento. */
  label?: string
  style?: CSSProperties
}

/** Contenedor de un documento: aplica el tema y apila las hojas. */
export function DocRoot({ theme, children, className, withStyles, label, style }: DocRootProps) {
  return (
    <div
      className={clsx('fzd', 'fzd-sheets', `fzd--${theme.paper}`, `fzd--font-${theme.font}`, className)}
      style={{ ...themeVars(theme), ...style }}
      data-paper={theme.paper}
      role="document"
      aria-label={label}
    >
      {withStyles ? <DocumentStyles theme={theme} /> : null}
      {children}
    </div>
  )
}

export interface DocPageProps {
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** Sin márgenes (portadas a sangre). */
  bleed?: boolean
  label?: string
}

export function DocPage({ children, footer, className, bleed, label }: DocPageProps) {
  return (
    <section className={clsx('fzd-page', bleed && 'fzd-page--bleed', className)} aria-label={label}>
      <div className="fzd-page__body">{children}</div>
      {footer}
    </section>
  )
}

// ── Cabecera y pie ────────────────────────────────────────────────────────────

export function OrgMark({ org, size = 'md' }: { org: DocOrg; size?: 'sm' | 'md' }) {
  if (org.logo) return <img className="fzd-brand__logo" src={org.logo} alt={org.name} />
  return (
    <div className="fzd-monogram" aria-hidden="true" style={size === 'sm' ? { width: 24, height: 24, fontSize: 10, borderRadius: 6 } : undefined}>
      {initials(org.name || 'Taller')}
    </div>
  )
}

/** Líneas de contacto de la empresa (razón social y RUT, dirección, contacto). */
export function orgContactLines(org: DocOrg): string[] {
  return [
    joinParts([org.legalName && org.legalName !== org.name ? org.legalName : undefined, org.rut ? `RUT ${org.rut}` : undefined]),
    joinParts([org.address, org.city], ', '),
    joinParts([org.phone, org.email, org.website?.replace(/^https?:\/\//, '')]),
  ].filter(Boolean)
}

export interface DocHeaderProps {
  org: DocOrg
  /** «Cotización», «Orden de trabajo»… */
  kind: string
  /** Número visible («412»); se antepone «N°». */
  number?: string | number
  meta?: DocMeta[]
  variant?: 'full' | 'compact'
  /** Reemplaza el bloque derecho. */
  aside?: ReactNode
  /** Texto a la derecha en la variante compacta. */
  context?: string
  className?: string
}

export function DocHeader({ org, kind, number, meta = [], variant = 'full', aside, context, className }: DocHeaderProps) {
  const numberText = number !== undefined && number !== '' ? `N° ${number}` : ''
  if (variant === 'compact') {
    return (
      <header className={clsx('fzd-header', 'fzd-header--compact', className)}>
        <div className="fzd-brand">
          <OrgMark org={org} size="sm" />
          {!org.logo ? <div className="fzd-brand__name">{org.name}</div> : null}
        </div>
        <div className="fzd-docid">
          {aside ?? joinParts([`${kind} ${numberText}`.trim(), context])}
        </div>
      </header>
    )
  }
  const contact = orgContactLines(org)
  return (
    <header className={clsx('fzd-header', className)}>
      <div className="fzd-brand">
        <OrgMark org={org} />
        <div className="fzd-brand__text">
          {org.name ? <div className="fzd-brand__name">{org.name}</div> : null}
          {contact.map((line) => (
            <div key={line} className="fzd-brand__meta">
              {line}
            </div>
          ))}
        </div>
      </div>
      {aside ?? (
        <div className="fzd-docid">
          <div className="fzd-docid__kind">{kind}</div>
          {numberText ? <div className="fzd-docid__number">{numberText}</div> : null}
          {meta.length ? (
            <div className="fzd-docid__meta">
              {meta.map((m) => (
                <div key={m.label}>
                  {m.label} <b>{m.value}</b>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </header>
  )
}

export interface DocFooterProps {
  page: number
  pages: number
  left?: ReactNode
  right?: ReactNode
}

export function DocFooter({ page, pages, left, right }: DocFooterProps) {
  return (
    <footer className="fzd-footer">
      <span className="fzd-footer__left">{left}</span>
      <span className="fzd-footer__right">{right ?? `Página ${page} de ${pages}`}</span>
    </footer>
  )
}

// ── Cifras ────────────────────────────────────────────────────────────────────

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={clsx('fzd-money', className)}>{formatClp(value)}</span>
}

export interface MeasureProps {
  width?: number
  height?: number
  /** Medida única en mm. */
  value?: number
  unit?: 'mm' | 'm' | 'm²'
  className?: string
}

export function Measure({ width, height, value, unit = 'mm', className }: MeasureProps) {
  let text = ''
  if (width !== undefined && height !== undefined) text = formatMeasure(width, height)
  else if (value !== undefined) text = unit === 'm²' ? formatArea(value) : unit === 'm' ? `${formatNumber(value, 2)} m` : `${formatMm(value)} mm`
  return <span className={clsx('fzd-measure', className)}>{text}</span>
}

// ── Muestras ──────────────────────────────────────────────────────────────────

export function Swatch({ color, size = 'sm', title }: { color: string; size?: 'sm' | 'lg'; title?: string }) {
  return <span className={clsx('fzd-swatch', size === 'lg' && 'fzd-swatch--lg')} style={{ background: color }} title={title} aria-hidden="true" />
}

/** Pictograma del vidrio en corte: monolítico, termopanel (DVH) o laminado. */
export function GlassGlyph({ kind = 'dvh', size = 12 }: { kind?: Glass['kind']; size?: number }) {
  const h = size
  const w = Math.round(size * 1.1)
  const pane = (x: number, key: string, width = 1.6) => <rect key={key} x={x} y={1} width={width} height={h - 2} rx={0.4} fill="#7FA9B3" />
  let panes: ReactNode[]
  if (kind === 'dvh') panes = [pane(w * 0.18, 'a'), <rect key="gap" x={w * 0.18 + 1.6} y={2.5} width={w * 0.64 - 3.2} height={h - 5} fill="#D9EBEE" />, pane(w * 0.82 - 1.6, 'b')]
  else if (kind === 'laminated') panes = [pane(w * 0.5 - 1.9, 'a', 1.4), pane(w * 0.5 + 0.5, 'b', 1.4)]
  else panes = [pane(w * 0.5 - 0.9, 'a', 1.8)]
  return (
    <svg className="fzd-glass" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {panes}
    </svg>
  )
}

// ── Totales ───────────────────────────────────────────────────────────────────

export interface TotalsBoxProps {
  totals: QuoteTotals
  extras?: QuoteExtra[]
  /** Porcentaje de IVA para el rótulo (por defecto se deduce de los totales). */
  ivaPct?: number
  showArea?: boolean
  variant?: 'box' | 'flat'
  note?: ReactNode
  className?: string
}

export function deduceIvaPct(totals: QuoteTotals): number {
  if (totals.net > 0 && totals.iva > 0) return Math.round((totals.iva / totals.net) * 1000) / 10
  return 19
}

/** Neto, descuento, extras, IVA y total. Los extras ocultos se agrupan en una línea. */
export function TotalsBox({ totals, extras = [], ivaPct, showArea = false, variant = 'box', note, className }: TotalsBoxProps) {
  const visible = extras.filter((e) => !e.hidden && e.amount !== 0)
  // Extras ocultos (y cualquier diferencia con el total de extras) se agrupan en una sola línea.
  const others = Math.round(totals.extras - visible.reduce((acc, e) => acc + e.amount, 0))
  const pct = ivaPct ?? deduceIvaPct(totals)
  return (
    <dl className={clsx('fzd-totals', variant === 'flat' && 'fzd-totals--flat', className)}>
      {showArea ? (
        <div className="fzd-totals__row fzd-totals__row--muted">
          <dt>
            {formatNumber(totals.units)} {totals.units === 1 ? 'unidad' : 'unidades'}
          </dt>
          <dd>{formatArea(totals.area)}</dd>
        </div>
      ) : null}
      <div className="fzd-totals__row">
        <dt>Subtotal</dt>
        <dd>{formatClp(totals.subtotal)}</dd>
      </div>
      {totals.discount > 0 ? (
        <div className="fzd-totals__row fzd-totals__row--discount">
          <dt>Descuento {totals.discountPct > 0 ? formatPct(totals.discountPct) : ''}</dt>
          <dd>{formatClp(-totals.discount)}</dd>
        </div>
      ) : null}
      {visible.map((extra) => (
        <div key={extra.id} className="fzd-totals__row">
          <dt>{extra.label}</dt>
          <dd>{formatClp(extra.amount)}</dd>
        </div>
      ))}
      {others !== 0 ? (
        <div className="fzd-totals__row">
          <dt>Servicios adicionales</dt>
          <dd>{formatClp(others)}</dd>
        </div>
      ) : null}
      <div className="fzd-totals__sep" />
      <div className="fzd-totals__row">
        <dt>Neto</dt>
        <dd>{formatClp(totals.net)}</dd>
      </div>
      <div className="fzd-totals__row">
        <dt>IVA {formatPct(pct)}</dt>
        <dd>{formatClp(totals.iva)}</dd>
      </div>
      <div className="fzd-totals__grand">
        <dt>Total</dt>
        <dd>{formatClp(totals.total)}</dd>
      </div>
      {note ? <div className="fzd-totals__note">{note}</div> : null}
    </dl>
  )
}

/** Cuotas calculadas a partir de la forma de pago («50% al aceptar, 50% contra entrega»). */
export function PaymentPlan({ text, total, className }: { text: string | undefined; total: number; className?: string }) {
  const steps = paymentSchedule(text, total)
  if (!steps) return null
  return (
    <div className={clsx('fzd-payplan', className)}>
      {steps.map((step, i) => (
        <div key={i} className="fzd-payplan__row">
          <span className="fzd-payplan__pct">{formatPct(step.pct)}</span>
          <span>{step.label}</span>
          <span className="fzd-payplan__amount">{formatClp(step.amount)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Firma ─────────────────────────────────────────────────────────────────────

export interface SignatureBlockProps {
  /** Aceptación en línea ya registrada (portal del cliente). */
  accepted?: { name: string; rut?: string; at: string }
  /** Nombre de quien firma por la empresa (opcional, columna izquierda). */
  companySigner?: string
  companyName?: string
  className?: string
}

export function SignatureBlock({ accepted, companySigner, companyName, className }: SignatureBlockProps) {
  if (accepted) {
    return (
      <div className={clsx('fzd-sign__accepted', className)}>
        <svg className="fzd-sign__check" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4.8 8.3l2.1 2.1 4.3-4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div style={{ fontWeight: 600 }}>Aceptada en línea</div>
          <div className="fzd-muted">
            {joinParts([accepted.name, accepted.rut ? `RUT ${accepted.rut}` : undefined])} · {formatDateLong(accepted.at)}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className={clsx('fzd-sign', className)}>
      <div className="fzd-sign__field">
        <div className="fzd-sign__space" />
        <div className="fzd-sign__label">Firma del cliente</div>
      </div>
      <div className="fzd-sign__field">
        <div className="fzd-sign__space" />
        <div className="fzd-sign__label">Nombre y RUT</div>
      </div>
      <div className="fzd-sign__field">
        <div className="fzd-sign__space" />
        <div className="fzd-sign__label">Fecha</div>
      </div>
      {companySigner ? (
        <div className="fzd-sign__label" style={{ gridColumn: '1 / -1', marginTop: 2 }}>
          Por {companyName ?? 'la empresa'}: {companySigner}
        </div>
      ) : null}
    </div>
  )
}
