import type { WorkshopPaper } from './types'

/**
 * Estilos de los documentos de taller: hojas de trabajo de la familia de la plantilla Obra (filas firmes,
 * encabezado negro, letra grande), autocontenidas e imprimibles.
 * Todo cuelga de `.fzw-doc` para no chocar con la app ni con los documentos de venta.
 * Pensados para láser en blanco y negro: el color ayuda, pero nada depende de él.
 */

export const WORKSHOP_PAPER_SIZES: Record<WorkshopPaper, { width: number; height: number; css: string; label: string }> = {
  letter: { width: 215.9, height: 279.4, css: 'letter', label: 'Carta' },
  a4: { width: 210, height: 297, css: 'A4', label: 'A4' },
}

export interface WorkshopCssOptions {
  paper?: WorkshopPaper
  /** Color de marca del taller (#RRGGBB). */
  accent?: string
  /** Texto del pie de página impreso («OT N° 38 · Cortes»). */
  footer?: string
  /** Regla @page propia (etiquetas en rollo/hoja). Reemplaza la estándar. */
  pageRule?: string
  /**
   * Plantilla traducida del número de página con marcadores \u0001 (página) y \u0002 (total):
   * «Página \u0001 de \u0002». Por defecto, español.
   */
  pageOf?: string
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** Archivo, la familia de la plantilla Obra, incrustada en el PDF. Sin monoespaciada: códigos y medidas van con cifras tabulares. */
const FONT_STACK = '"Archivo Variable", "Instrument Sans Variable", "Inter Tight Variable", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'

const DEFAULT_ACCENT = '#15161D'

function cssString(text: string): string {
  // `<` y `>` como escapes CSS: el texto (título de la obra, nombre de la empresa) va dentro de un
  // <style> serializado y un «</style>» lo cerraría e inyectaría HTML en el documento.
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').replace(/</g, '\\3C ').replace(/>/g, '\\3E ')}"`
}

/** «Página \u0001 de \u0002» → contenido CSS con contadores (texto escapado, nunca crudo). */
function pageCounterContent(template: string): string {
  const parts: string[] = []
  for (const piece of template.split(/(\u0001|\u0002)/)) {
    if (piece === '\u0001') parts.push('counter(page)')
    else if (piece === '\u0002') parts.push('counter(pages)')
    else if (piece) parts.push(cssString(piece))
  }
  return parts.length ? parts.join(' ') : 'counter(page)'
}

/** Regla @page estándar con pie y número de página (Chromium ≥ 131). */
export function workshopPageRule(paper: WorkshopPaper = 'letter', footer = '', pageOf = 'Página \u0001 de \u0002'): string {
  const size = WORKSHOP_PAPER_SIZES[paper].css
  const foot = footer
    ? `@bottom-left { content: ${cssString(footer)}; font: 8.5pt ${FONT_STACK}; color: #4A5457; }`
    : ''
  return `@page {
  size: ${size};
  margin: 11mm 12mm 13mm;
  ${foot}
  @bottom-right { content: ${pageCounterContent(pageOf)}; font: 8.5pt ${FONT_STACK}; color: #4A5457; }
}`
}

const BASE_CSS = `
.fzw-doc {
  --fzw-ink: #1D2426;
  --fzw-muted: #4A5457;
  --fzw-faint: #7E888C;
  --fzw-rule: #B4BBBE;
  --fzw-soft: #F3F5F6;
  --fzw-paper: #FFFFFF;
  --fzw-dim: #2856AA;
  --fzw-info-bg: #EBF1FE;
  --fzw-warn: #855500;
  --fzw-warn-bg: #FFF3D7;
  --fzw-bad: #AF303D;
  --fzw-bad-bg: #FDECEE;
  --fzw-ok: #246C47;
  font-family: ${FONT_STACK};
  color: var(--fzw-ink);
  font-size: 11pt;
  font-stretch: 94%;
  line-height: 1.32;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  text-rendering: geometricPrecision;
}
.fzw-doc *, .fzw-doc *::before, .fzw-doc *::after { box-sizing: border-box; }
.fzw-doc h1, .fzw-doc h2, .fzw-doc h3, .fzw-doc p { margin: 0; }
.fzw-doc svg { display: block; }
.fzw-doc svg text { font-family: inherit !important; }

/* Hojas: en pantalla se ven como papel; al imprimir fluyen con @page. */
.fzw-sheet {
  position: relative;
  width: var(--fzw-page-w);
  min-height: var(--fzw-page-h);
  margin: 0 auto 8mm;
  padding: 11mm 12mm 13mm;
  background: var(--fzw-paper);
  box-shadow: 0 1px 2px rgb(16 22 24 / .06), 0 10px 30px rgb(16 22 24 / .08);
  display: flex;
  flex-direction: column;
}
.fzw-foot {
  margin-top: auto;
  padding-top: 4mm;
  display: flex;
  justify-content: space-between;
  gap: 4mm;
  font-size: 8.5pt;
  color: var(--fzw-muted);
}

/* Cabecera */
.fzw-head {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  gap: 6mm;
  padding-bottom: 2.4mm;
  border-bottom: 0.9mm solid var(--fzw-ink);
  margin-bottom: 4mm;
}
.fzw-brand { display: flex; align-items: center; gap: 3mm; min-width: 0; }
.fzw-brand img { max-height: 12mm; max-width: 45mm; object-fit: contain; }
.fzw-brand-name { font-size: 14pt; font-weight: 700; letter-spacing: -0.012em; }
.fzw-brand-sub { font-size: 9.5pt; color: var(--fzw-muted); margin-top: 0.6mm; }
.fzw-head-right { text-align: right; }
.fzw-head-kicker { font-size: 9.5pt; color: var(--fzw-muted); }
.fzw-head-title { font-size: 21pt; font-weight: 700; letter-spacing: -0.018em; line-height: 1.1; }
.fzw-head-meta { font-size: 9.5pt; color: var(--fzw-muted); margin-top: 1mm; }
.fzw-head-meta strong { color: var(--fzw-ink); font-weight: 700; }

/* Ventana (banda de identificación) */
.fzw-win {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 4.5mm;
  margin-bottom: 3mm;
}
.fzw-ref {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17mm;
  height: 14mm;
  padding: 0 2.5mm;
  background: var(--fzw-ink);
  color: var(--fzw-paper);
  font-size: 24pt;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
}
.fzw-ref-sm { min-width: 12mm; height: 10mm; font-size: 16pt; }
.fzw-win > div { min-width: 0; }
.fzw-ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fzw-win-name { font-size: 15pt; font-weight: 700; letter-spacing: -0.012em; }
.fzw-win-desc { font-size: 9.5pt; color: var(--fzw-muted); margin-top: 0.6mm; }
.fzw-win-size { text-align: right; }
.fzw-win-size strong { display: block; font-size: 19pt; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; }
.fzw-win-size span { font-size: 10pt; color: var(--fzw-muted); }
.fzw-qty-chip {
  display: inline-block;
  margin-top: 0.6mm;
  font-size: 11pt;
  font-weight: 700;
  color: var(--fzw-ink) !important;
}

/* Secciones */
.fzw-h {
  display: flex;
  align-items: baseline;
  gap: 3mm;
  margin: 4mm 0 1.6mm;
  font-size: 13pt;
  font-weight: 700;
  letter-spacing: -0.008em;
  break-after: avoid;
}
.fzw-h small { font-size: 9.5pt; font-weight: 400; color: var(--fzw-muted); }
.fzw-h:first-child { margin-top: 0; }
.fzw-muted { color: var(--fzw-muted); }
.fzw-small { font-size: 9.5pt; }
.fzw-mono { font-variant-numeric: lining-nums tabular-nums; }
.fzw-nowrap { white-space: nowrap; }
.fzw-grow { flex: 1 1 auto; }

/* Tablas */
.fzw-table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
.fzw-table thead { display: table-header-group; }
/* Los totales van una sola vez, al final de la tabla: Chromium repite el tfoot en cada hoja impresa. */
.fzw-table tfoot { display: table-row-group; break-inside: avoid; }
.fzw-table th {
  padding: 1.2mm 2mm;
  text-align: left;
  font-size: 9pt;
  font-weight: 600;
  background: var(--fzw-ink);
  color: var(--fzw-paper);
  white-space: nowrap;
}
.fzw-table td {
  padding: 1.25mm 2mm;
  border-bottom: 0.2mm solid var(--fzw-rule);
  vertical-align: middle;
  line-height: 1.22;
}
.fzw-table td.num { line-height: 1.05; }
.fzw-table tr { break-inside: avoid; }
.fzw-table .num { text-align: right; white-space: nowrap; }
.fzw-table .ctr { text-align: center; }
.fzw-table .chk { width: 7mm; text-align: center; padding-left: 1mm; padding-right: 1mm; }
.fzw-table tfoot td { border-bottom: 0; border-top: 0.35mm solid var(--fzw-ink); font-weight: 600; }
.fzw-table .fzw-group td {
  padding-top: 3mm;
  font-size: 10pt;
  font-weight: 700;
  color: var(--fzw-ink);
  border-bottom: 0.35mm solid var(--fzw-ink);
}
.fzw-table .fzw-group { break-after: avoid; page-break-after: avoid; }
.fzw-table-dense td { padding-top: 0.9mm; padding-bottom: 0.9mm; }
.fzw-table-cuts td { padding-top: 0.95mm; padding-bottom: 0.95mm; }
.fzw-table .fzw-thead-title th { padding: 0; background: none; border-bottom: 0; color: var(--fzw-ink); font-size: inherit; white-space: normal; }
.fzw-table .fzw-thead-title .fzw-h { margin: 3mm 0 1mm; }
.fzw-table-cuts .fzw-group td { padding-top: 2.2mm; padding-bottom: 0.8mm; }
.fzw-big { font-size: 18pt; font-weight: 700; letter-spacing: -0.015em; line-height: 1; white-space: nowrap; }
.fzw-mid { font-size: 13pt; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; }
.fzw-unit { font-size: 9pt; font-weight: 400; color: var(--fzw-muted); margin-left: 0.8mm; }
.fzw-cell-title { font-weight: 700; }
.fzw-cell-sub { font-size: 9pt; color: var(--fzw-muted); margin-top: 0.3mm; }
.fzw-row-warn td { background: var(--fzw-soft); font-weight: 700; }

/* Casillas para marcar a mano */
.fzw-box {
  display: inline-block;
  width: 5mm;
  height: 5mm;
  border: 0.4mm solid var(--fzw-ink);
  vertical-align: middle;
  background: var(--fzw-paper);
}
.fzw-box-lg { width: 6.5mm; height: 6.5mm; }
.fzw-box-na { border-style: dashed; border-color: var(--fzw-faint); position: relative; }
.fzw-box-na::after {
  content: "";
  position: absolute;
  left: 15%; right: 15%; top: 50%;
  border-top: 0.3mm solid var(--fzw-faint);
}

/* Avisos */
.fzw-callout {
  margin: 3mm 0;
  padding: 2.2mm 3mm;
  border: 0.35mm solid var(--fzw-ink);
  break-inside: avoid;
}
.fzw-callout-title { font-weight: 700; margin-bottom: 0.8mm; }
.fzw-callout ul { margin: 0; padding-left: 4.5mm; }
.fzw-callout li + li { margin-top: 0.6mm; }
.fzw-callout-bad { border-width: 0.7mm; }
.fzw-callout-info { border-color: var(--fzw-rule); }
.fzw-tag {
  display: inline-block;
  padding: 0.2mm 1.4mm;
  border: 0.25mm solid var(--fzw-ink);
  font-size: 8.5pt;
  font-weight: 700;
  color: var(--fzw-ink);
  white-space: nowrap;
}
.fzw-tag-muted { border-color: var(--fzw-rule); font-weight: 500; color: var(--fzw-muted); }

/* Indicadores */
.fzw-kpis { display: flex; flex-wrap: wrap; gap: 0; margin-bottom: 4mm; border-bottom: 0.35mm solid var(--fzw-ink); }
.fzw-kpi {
  flex: 1 1 0;
  min-width: 30mm;
  padding: 0.5mm 4mm 2.4mm;
  border-left: 0.2mm solid var(--fzw-rule);
}
.fzw-kpi:first-child { padding-left: 0; border-left: 0; }
.fzw-kpi span { display: block; font-size: 9.5pt; color: var(--fzw-muted); }
.fzw-kpi strong { display: block; font-size: 20pt; font-weight: 700; letter-spacing: -0.015em; margin-top: 0.5mm; white-space: nowrap; }
.fzw-kpi em { display: block; font-style: normal; font-size: 9pt; color: var(--fzw-muted); margin-top: 0.4mm; }

.fzw-meter { position: relative; height: 2.6mm; min-width: 18mm; background: var(--fzw-soft); overflow: hidden; }
.fzw-meter > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--fzw-ink); }

.fzw-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
.fzw-grid-ot { display: grid; grid-template-columns: 80mm 1fr; gap: 6mm; align-items: start; }
.fzw-ot-route { margin: 0 0 4mm; }
.fzw-ot-side { display: grid; gap: 2.2mm; margin-top: 3mm; }
.fzw-ot-side .fzw-notes-text { margin: 0; font-size: 9.5pt; }
.fzw-drawing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1mm;
  break-inside: avoid;
}
.fzw-drawing-caption { font-size: 9pt; color: var(--fzw-muted); align-self: stretch; display: flex; justify-content: space-between; }

/* Escritura a mano */
.fzw-write { display: flex; align-items: flex-end; gap: 2mm; font-size: 9.5pt; color: var(--fzw-muted); }
.fzw-write > i { flex: 1 1 auto; min-width: 14mm; border-bottom: 0.25mm solid var(--fzw-ink); height: 5mm; }
.fzw-lines > div { height: 6mm; border-bottom: 0.2mm solid var(--fzw-rule); }
.fzw-notes-text { white-space: pre-wrap; font-size: 10pt; margin-bottom: 1.5mm; }

/* Estaciones */
.fzw-stations {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border: 0.4mm solid var(--fzw-ink);
  overflow: hidden;
  break-inside: avoid;
}
.fzw-station { padding: 1.4mm 2mm; border-right: 0.2mm solid var(--fzw-rule); display: flex; flex-direction: column; gap: 1.4mm; }
.fzw-station:last-child { border-right: 0; }
.fzw-station-top { display: flex; align-items: center; justify-content: space-between; gap: 1mm; font-weight: 700; font-size: 10pt; }
.fzw-station .fzw-write > i { height: 3.5mm; }
.fzw-station .fzw-write { font-size: 8pt; gap: 1mm; }
.fzw-station .fzw-write > i { min-width: 3mm; }

/* Firmas */
.fzw-signs { display: grid; grid-template-columns: repeat(auto-fit, minmax(40mm, 1fr)); gap: 6mm; margin-top: 6mm; break-inside: avoid; }
.fzw-sign { border-top: 0.3mm solid var(--fzw-ink); padding-top: 1.2mm; font-size: 9.5pt; color: var(--fzw-muted); display: flex; justify-content: space-between; }

/* Optimización de cortes */
.fzw-saw { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); margin: 0 0 1.5mm; border: 0.4mm solid var(--fzw-ink); break-inside: avoid; }
.fzw-saw > div { padding: 1mm 2.5mm 1.3mm; border-left: 0.2mm solid var(--fzw-rule); min-width: 0; }
.fzw-saw > div:first-child { border-left: 0; }
.fzw-saw dt { font-size: 9pt; color: var(--fzw-muted); }
.fzw-saw dd { margin: 0; font-size: 15pt; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; }
.fzw-saw-note { margin-bottom: 3mm; }
.fzw-bar-group { margin-bottom: 2mm; }
.fzw-bar-group-head { break-inside: avoid; break-after: avoid; page-break-after: avoid; margin: 6mm 0 2mm; padding-bottom: 1mm; border-bottom: 0.5mm solid var(--fzw-ink); }
.fzw-bar-group .fzw-bar-group-title { margin: 0 0 0.4mm; justify-content: space-between; break-after: avoid; page-break-after: avoid; }
.fzw-bar-row { margin-bottom: 4mm; break-inside: avoid; }
.fzw-bar-head { display: flex; align-items: baseline; gap: 3mm; font-size: 10pt; margin-bottom: 0.8mm; }
.fzw-bar-no { font-size: 12pt; font-weight: 700; white-space: nowrap; }
.fzw-bar-rest { white-space: nowrap; }
.fzw-bar-rest strong { font-size: 12pt; font-weight: 700; }
.fzw-bar-cont { display: none; color: var(--fzw-ink); font-weight: 600; }
.fzw-tighter .fzw-bar-cont { display: inline; }
.fzw-bar-pieces { list-style: none; margin: 0.4mm 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 7mm; }
.fzw-bar-pieces li { display: flex; align-items: center; gap: 1.8mm; min-height: 7.2mm; padding: 0.5mm 0; border-bottom: 0.2mm solid var(--fzw-rule); }
.fzw-bp-n { width: 4mm; text-align: right; font-size: 9.5pt; color: var(--fzw-muted); }
.fzw-bp-mm { min-width: 18mm; text-align: right; font-size: 15pt; font-weight: 700; letter-spacing: -0.012em; line-height: 1; white-space: nowrap; }
.fzw-bp-cut { display: inline-flex; align-items: center; gap: 1.2mm; white-space: nowrap; }
.fzw-bp-id { margin-left: auto; text-align: right; font-size: 10pt; white-space: nowrap; }
.fzw-bp-id strong { font-weight: 700; }
.fzw-bp-id small { font-size: 8.5pt; color: var(--fzw-muted); }
.fzw-table-order { margin-bottom: 4mm; }
.fzw-table-order .fzw-h { display: block; }
.fzw-table-order .fzw-h small { display: block; margin-top: 0.4mm; }
.fzw-table-order td { padding-top: 0.7mm; padding-bottom: 0.7mm; }
.fzw-order-bar { font-weight: 400; font-size: 9.5pt; color: var(--fzw-muted); margin-left: 3mm; }
.fzw-swatch { display: inline-block; width: 3.4mm; height: 3.4mm; border: 0.25mm solid rgb(31 28 24 / .45); vertical-align: -0.4mm; margin-right: 1.2mm; }

/* Planes por ventana */
.fzw-plan-card { margin-top: 5mm; }
.fzw-plan-card:first-child { margin-top: 0; }
.fzw-plan-block { margin-top: 4mm; }
.fzw-template { margin: 0 0 6mm; break-inside: avoid; }
.fzw-template-head { display: flex; align-items: baseline; gap: 3mm; font-size: 10.5pt; border-top: 0.5mm solid var(--fzw-ink); padding-top: 1.2mm; margin-bottom: 1mm; }
.fzw-template-head strong { font-size: 12pt; }

/* Portada, levantamiento e instalación */
.fzw-cover-title { font-size: 20pt; font-weight: 700; letter-spacing: -0.015em; margin: 1mm 0 3mm; }
.fzw-index { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.6mm 7mm; font-size: 10.5pt; }
.fzw-index li { display: flex; align-items: center; gap: 2mm; }
.fzw-survey th { text-align: center; }
.fzw-survey td { height: 9.5mm; border: 0.25mm solid var(--fzw-rule); }
.fzw-survey-off { background: var(--fzw-soft); }
.fzw-survey-checks { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 2mm 5mm; margin-top: 2mm; font-size: 10pt; }
.fzw-survey-checks > span { display: inline-flex; align-items: center; gap: 1.4mm; white-space: nowrap; }
.fzw-install-row td { height: 11.5mm; }

/* Montaje */
.fzw-cards { display: grid; grid-template-columns: 1fr; gap: 5mm; }
.fzw-card { border-top: 0.9mm solid var(--fzw-ink); padding: 3mm 0 0; break-inside: avoid; }
.fzw-card:first-child { border-top: 0; padding-top: 0; }
.fzw-card-grid { display: grid; grid-template-columns: 52mm 1fr; gap: 5mm; align-items: start; }
.fzw-check th.unit, .fzw-check td.unit { width: 11mm; text-align: center; }
.fzw-check td { padding-top: 1.1mm; padding-bottom: 1.1mm; }
.fzw-card .fzw-signs { margin-top: 4mm; }
.fzw-na { color: var(--fzw-faint); }

/* Etiquetas de piezas */
.fzw-labels-sheet {
  display: grid;
  grid-template-columns: repeat(2, 100mm);
  grid-auto-rows: 50mm;
  justify-content: center;
  align-content: start;
}
.fzw-label {
  width: 100mm;
  height: 50mm;
  padding: 3.2mm 3.5mm;
  display: grid;
  grid-template-columns: 27mm 1fr;
  column-gap: 3.2mm;
  overflow: hidden;
  outline: 0.2mm dashed #A7B0B3;
  outline-offset: -0.1mm;
  break-inside: avoid;
}
.fzw-label-qr { display: flex; flex-direction: column; justify-content: space-between; }
.fzw-label-qr small { font-size: 6.5pt; color: var(--fzw-muted); line-height: 1.2; }
.fzw-label-main { display: flex; flex-direction: column; min-width: 0; }
.fzw-label-top { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; }
.fzw-label-code { font-size: 15pt; font-weight: 700; letter-spacing: -0.01em; line-height: 1; white-space: nowrap; }
.fzw-label-unit { font-size: 7pt; color: var(--fzw-muted); white-space: nowrap; }
.fzw-label-name { font-size: 8pt; margin-top: 1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fzw-label-measure { font-size: 30pt; font-weight: 700; letter-spacing: -0.03em; line-height: 1; margin-top: auto; white-space: nowrap; }
.fzw-label-measure small { font-size: 9pt; font-weight: 500; color: var(--fzw-muted); margin-left: 1mm; letter-spacing: 0; }
.fzw-label-bottom { display: flex; align-items: center; justify-content: space-between; gap: 2mm; margin-top: 1.2mm; font-size: 8pt; }
.fzw-label-bottom strong { font-size: 9.5pt; }
.fzw-label-bar { font-size: 9pt; font-weight: 600; white-space: nowrap; }

/* Compactas: la hoja se pasaba a otra página por unas pocas filas (ver fitWorkshopSheets). */
.fzw-tight .fzw-head { margin-bottom: 3mm; }
.fzw-tight .fzw-win { margin-bottom: 2mm; }
.fzw-tight .fzw-ot-route { margin-bottom: 2.5mm; }
.fzw-tight .fzw-h { margin-top: 2.5mm; margin-bottom: 1mm; }
.fzw-tight .fzw-table td { padding-top: 0.7mm; padding-bottom: 0.7mm; }
.fzw-tight .fzw-table-cuts td { padding-top: 0.45mm; padding-bottom: 0.45mm; }
.fzw-tight .fzw-table .fzw-group td { padding-top: 1.3mm; padding-bottom: 0.4mm; }
.fzw-tight .fzw-big { font-size: 15pt; }
.fzw-tight .fzw-kpis { margin-bottom: 3mm; }
.fzw-tight .fzw-kpi { padding-top: 1.8mm; padding-bottom: 1.8mm; }
.fzw-tight .fzw-signs { margin-top: 4mm; }
.fzw-tight .fzw-lines > div { height: 5mm; }
.fzw-tight .fzw-bar-group { margin-bottom: 1mm; }
.fzw-tight .fzw-bar-group-head { margin-top: 4mm; }
.fzw-tight .fzw-bar-row { margin-bottom: 3mm; }
.fzw-tighter .fzw-table td, .fzw-tighter .fzw-table-cuts td { padding-top: 0.3mm; padding-bottom: 0.3mm; }
.fzw-tighter .fzw-table th { padding-top: 0.8mm; padding-bottom: 0.8mm; }
.fzw-tighter .fzw-big { font-size: 13.5pt; }
.fzw-tighter .fzw-mid { font-size: 11pt; }
.fzw-tighter .fzw-drawing svg { max-height: 46mm; width: auto; }
.fzw-tighter .fzw-ot-side { margin-top: 2mm; gap: 1.6mm; }
.fzw-tighter .fzw-station { padding-top: 1mm; padding-bottom: 1mm; gap: 1mm; }
/* Lo más compacto: más barras por hoja sin achicar las medidas. */
.fzw-tighter .fzw-bar-group-head { margin-top: 3mm; }
.fzw-tighter .fzw-bar-row { margin-bottom: 2mm; }
.fzw-tighter .fzw-bar-pieces li { min-height: 6.4mm; padding: 0.2mm 0; }

/* Documentos con más columnas: un punto menos para que cada fila quede en una línea. */
.fzw-doc-materials-costs .fzw-table { font-size: 9.5pt; }
.fzw-doc-materials-costs .fzw-table .fzw-small, .fzw-doc-materials-costs .fzw-table .fzw-unit { font-size: 8.5pt; }
.fzw-doc-costs .fzw-brand-sub, .fzw-doc-costs .fzw-head-meta { font-size: 9pt; }

/* Utilidades de impresión */
.fzw-avoid { break-inside: avoid; }
.fzw-break { break-before: page; }

@media print {
  .fzw-doc { background: none; }
  .fzw-sheet {
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    box-shadow: none;
    break-after: page;
  }
  .fzw-sheet { display: block; }
  .fzw-sheet:last-child { break-after: auto; }
  .fzw-foot { display: none; }
  .fzw-label { outline: 0; }
}
`

/** CSS completo para un documento (variables de papel + @page + estilos base). */
export function workshopCss(opts: WorkshopCssOptions = {}): string {
  const paper = opts.paper ?? 'letter'
  const size = WORKSHOP_PAPER_SIZES[paper]
  const accent = opts.accent && HEX.test(opts.accent) ? opts.accent : DEFAULT_ACCENT
  const vars = `.fzw-doc { --fzw-page-w: ${size.width}mm; --fzw-page-h: ${size.height}mm; --fzw-accent: ${accent}; }`
  const page = opts.pageRule ?? workshopPageRule(paper, opts.footer ?? '', opts.pageOf)
  return `${page}\n${vars}\n${BASE_CSS}`
}

/** CSS por defecto (Carta, sin pie), para quien quiera inyectarlo una sola vez. */
export const WORKSHOP_CSS = workshopCss()
