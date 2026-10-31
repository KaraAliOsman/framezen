import { SALES_CSS } from '../sales/styles'
import { PAGE_MARGIN, PAPER_SIZE, FOOTER_HEIGHT, themeVarsCss, type DocTheme, DEFAULT_THEME } from './theme'

/**
 * CSS de los documentos. Todo vive bajo `.fzd` para convivir con la app web.
 * Unidades en px CSS (96 dpi): lo que se ve en pantalla es lo que imprime Chromium.
 */
export const BASE_CSS = /* css */ `
.fzd {
  --fzd-ink: #1F1C18;
  --fzd-ink-2: #45403A;
  --fzd-muted: #6F685E;
  --fzd-faint: #9C9489;
  --fzd-rule: #E4DFD7;
  --fzd-rule-strong: #CFC8BD;
  --fzd-paper: #FFFFFF;
  --fzd-tint: #FAF8F5;
  --fzd-tint-2: #F4F1EC;
  --fzd-dim: #1F3AA0;
  color: var(--fzd-ink);
  font-family: var(--fzd-text);
  font-size: 12px;
  line-height: 1.5;
  font-kerning: normal;
  font-optical-sizing: auto;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.fzd *, .fzd *::before, .fzd *::after { box-sizing: border-box; margin: 0; padding: 0; }
.fzd img, .fzd svg { display: block; max-width: none; }
.fzd table { border-collapse: collapse; border-spacing: 0; width: 100%; }
.fzd ul, .fzd ol { list-style: none; }

/* Hojas */
.fzd-sheets { display: flex; flex-direction: column; align-items: center; gap: 28px; }
.fzd-page {
  position: relative;
  width: var(--fzd-page-w);
  min-height: var(--fzd-page-h);
  padding: ${PAGE_MARGIN.top}px ${PAGE_MARGIN.right}px ${PAGE_MARGIN.bottom + FOOTER_HEIGHT}px ${PAGE_MARGIN.left}px;
  background: var(--fzd-paper);
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgb(31 28 24 / .08), 0 12px 32px -16px rgb(31 28 24 / .16);
  border-radius: 2px;
}
.fzd-page--bleed { padding: 0; }
.fzd-page__body { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
.fzd-page__spacer { flex: 1 1 auto; }

/* Tipografía */
.fzd-display { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); line-height: 1.1; }
.fzd-h1 { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 30px; line-height: 1.12; }
.fzd-h2 { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 19px; line-height: 1.2; }
.fzd-h3 { font-size: 13px; font-weight: 600; line-height: 1.3; letter-spacing: -0.005em; }
.fzd-label { font-size: 10px; line-height: 1.4; font-weight: 500; color: var(--fzd-muted); letter-spacing: 0.01em; }
.fzd-small { font-size: 10.5px; line-height: 1.45; color: var(--fzd-muted); }
.fzd-lead { font-size: 13px; line-height: 1.55; color: var(--fzd-ink-2); }
.fzd-muted { color: var(--fzd-muted); }
.fzd-accent { color: var(--fzd-accent-ink); }
.fzd-num, .fzd-money, .fzd-measure { font-variant-numeric: tabular-nums lining-nums; font-feature-settings: 'tnum' 1, 'lnum' 1; }
.fzd-money, .fzd-measure { white-space: nowrap; }
.fzd-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
.fzd-nowrap { white-space: nowrap; }
.fzd-right { text-align: right; }
.fzd-rule { height: 1px; background: var(--fzd-rule); border: 0; }
.fzd-rule--ink { background: var(--fzd-ink); }

/* Cabecera */
.fzd-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; align-items: start; }
.fzd-brand { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
.fzd-brand__logo { max-height: 46px; max-width: 168px; width: auto; height: auto; object-fit: contain; object-position: left center; }
.fzd-brand__text { min-width: 0; }
.fzd-brand__name { font-size: 13px; font-weight: 600; line-height: 1.3; letter-spacing: -0.005em; }
.fzd-brand__meta { font-size: 9.5px; line-height: 1.5; color: var(--fzd-muted); }
.fzd-monogram {
  width: 40px; height: 40px; flex: none; border-radius: 9px;
  background: var(--fzd-accent); color: var(--fzd-accent-on);
  display: grid; place-items: center;
  font-family: var(--fzd-display); font-weight: 600; font-size: 15px; letter-spacing: -0.02em;
}
.fzd-docid { text-align: right; }
.fzd-docid__kind { font-size: 10.5px; color: var(--fzd-muted); font-weight: 500; }
.fzd-docid__number { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 24px; line-height: 1.1; font-variant-numeric: tabular-nums lining-nums; }
.fzd-docid__meta { margin-top: 6px; font-size: 10px; color: var(--fzd-muted); line-height: 1.55; }
.fzd-docid__meta b { color: var(--fzd-ink); font-weight: 500; }
.fzd-header--compact { grid-template-columns: minmax(0, 1fr) auto; align-items: center; padding-bottom: 10px; border-bottom: 1px solid var(--fzd-rule); }
.fzd-header--compact .fzd-brand__logo { max-height: 26px; max-width: 120px; }
.fzd-header--compact .fzd-monogram { width: 24px; height: 24px; border-radius: 6px; font-size: 10px; }
.fzd-header--compact .fzd-brand { align-items: center; gap: 8px; }
.fzd-header--compact .fzd-docid { font-size: 10px; color: var(--fzd-muted); }

/* Pie */
.fzd-footer {
  position: absolute; left: ${PAGE_MARGIN.left}px; right: ${PAGE_MARGIN.right}px; bottom: 22px;
  display: flex; justify-content: space-between; gap: 16px; align-items: baseline;
  font-size: 9px; color: var(--fzd-faint); line-height: 1.3;
  font-variant-numeric: tabular-nums lining-nums;
}
.fzd-footer__left { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fzd-footer__right { white-space: nowrap; }

/* Pares etiqueta/valor */
.fzd-kv { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 12px; row-gap: 3px; font-size: 11px; }
.fzd-kv dt { color: var(--fzd-muted); font-size: 10px; padding-top: 1px; }
.fzd-kv dd { color: var(--fzd-ink); min-width: 0; }
.fzd-specs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 18px; row-gap: 6px; }
.fzd-spec { min-width: 0; }
.fzd-spec dt { font-size: 9.5px; color: var(--fzd-muted); line-height: 1.3; }
.fzd-spec dd { font-size: 11px; line-height: 1.35; color: var(--fzd-ink); display: flex; align-items: center; gap: 5px; min-width: 0; }

/* Etiqueta de ítem (V1) */
.fzd-ref {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 26px; height: 18px; padding: 0 5px;
  border: 1px solid var(--fzd-ink); border-radius: 2px;
  font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums lining-nums; white-space: nowrap;
}
.fzd-ref--accent { border-color: var(--fzd-accent); color: var(--fzd-accent-ink); }
.fzd-ref--solid { background: var(--fzd-ink); color: #fff; }
.fzd-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border-radius: 999px; background: var(--fzd-tint-2); font-size: 9.5px; color: var(--fzd-ink-2); white-space: nowrap; }

/* Muestra de color y glifo de vidrio */
.fzd-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex: none; box-shadow: inset 0 0 0 1px rgb(31 28 24 / .22); vertical-align: -1px; }
.fzd-swatch--lg { width: 14px; height: 14px; border-radius: 3px; }
.fzd-glass { display: inline-block; flex: none; vertical-align: -2px; }

/* Tabla */
.fzd-table th { font-size: 9.5px; font-weight: 500; color: var(--fzd-muted); text-align: left; padding: 0 6px 6px; border-bottom: 1px solid var(--fzd-ink); white-space: nowrap; }
.fzd-table td { padding: 7px 6px; border-bottom: 1px solid var(--fzd-rule); vertical-align: middle; font-size: 11px; }
.fzd-table th:first-child, .fzd-table td:first-child { padding-left: 0; }
.fzd-table th:last-child, .fzd-table td:last-child { padding-right: 0; }
.fzd-table .is-num { text-align: right; font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
.fzd-table tr { break-inside: avoid; }

/* Totales */
.fzd-totals { width: 286px; border: 1px solid var(--fzd-rule); border-radius: 8px; padding: 12px 16px 14px; background: var(--fzd-paper); break-inside: avoid; }
.fzd-totals__row { display: flex; justify-content: space-between; gap: 16px; font-size: 11px; line-height: 1.4; padding: 3px 0; }
.fzd-totals__row dt { color: var(--fzd-ink-2); }
.fzd-totals__row dd { font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
.fzd-totals__row--muted dt, .fzd-totals__row--muted dd { color: var(--fzd-muted); font-size: 10px; }
.fzd-totals__row--discount dd { color: var(--fzd-ink); }
.fzd-totals__sep { height: 1px; background: var(--fzd-rule); margin: 6px 0; }
.fzd-totals__grand { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-top: 8px; padding-top: 10px; border-top: 1.5px solid var(--fzd-ink); }
.fzd-totals__grand dt { font-size: 11.5px; font-weight: 600; }
.fzd-totals__grand dd { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 22px; line-height: 1; font-variant-numeric: tabular-nums lining-nums; color: var(--fzd-ink); white-space: nowrap; }
.fzd-totals__note { margin-top: 8px; font-size: 9.5px; color: var(--fzd-muted); }
.fzd-totals--flat { border: 0; border-radius: 0; padding: 0; background: transparent; }

/* Plan de pago */
.fzd-payplan { display: grid; gap: 4px; }
.fzd-payplan__row { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; font-size: 10.5px; }
.fzd-payplan__pct { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--fzd-accent-ink); }
.fzd-payplan__amount { font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }

/* Condiciones en dos columnas */
.fzd-terms { column-count: 2; column-gap: 28px; padding-bottom: 2px; }
.fzd-term { break-inside: avoid; margin-bottom: 12px; }
.fzd-term__title { font-size: 10.5px; font-weight: 600; margin-bottom: 2px; color: var(--fzd-ink); }
.fzd-term__body { font-size: 10px; line-height: 1.5; color: var(--fzd-ink-2); }

/* Texto enriquecido simple */
.fzd-rich p + p, .fzd-rich p + ul, .fzd-rich ul + p { margin-top: 5px; }
.fzd-rich ul { display: grid; gap: 2px; }
.fzd-rich li { position: relative; padding-left: 11px; }
.fzd-rich li::before { content: ''; position: absolute; left: 1px; top: 0.62em; width: 4px; height: 1px; background: currentColor; opacity: .7; }
.fzd-rich h4 { font-size: 1em; font-weight: 600; color: var(--fzd-ink); margin-top: 6px; }
.fzd-rich h4:first-child { margin-top: 0; }
.fzd-rich strong { font-weight: 600; color: var(--fzd-ink); }
.fzd-pre { white-space: pre-line; }

/* Firma */
.fzd-sign { display: grid; grid-template-columns: 1.4fr 1fr 0.8fr; gap: 20px; align-items: end; break-inside: avoid; }
.fzd-sign__field { min-width: 0; }
.fzd-sign__space { height: 40px; border-bottom: 1px solid var(--fzd-ink); }
.fzd-sign__label { margin-top: 5px; font-size: 9.5px; color: var(--fzd-muted); }
.fzd-sign__accepted { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--fzd-accent-line); background: var(--fzd-accent-soft); border-radius: 6px; font-size: 10.5px; }
.fzd-sign__check { width: 16px; height: 16px; flex: none; margin-top: 1px; color: var(--fzd-accent-ink); }

/* Edición en pantalla (nunca aparece en el PDF) */
.fzd-editable { border-radius: 3px; transition: background-color 120ms cubic-bezier(.2,0,0,1), box-shadow 120ms cubic-bezier(.2,0,0,1); }
.fzd-editable--on { cursor: text; outline: none; }
.fzd-editable--on:hover { box-shadow: 0 0 0 1px var(--fzd-accent-line); background: var(--fzd-accent-soft); }
.fzd-editable--on:focus { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #3A5BD6; background: #fff; }
.fzd-editable--on:empty::before { content: attr(data-placeholder); color: var(--fzd-faint); }
.fzd-editable--inline { display: inline; padding: 0 1px; }
@media (prefers-reduced-motion: reduce) { .fzd-editable { transition: none; } }

/* Dibujo */
.fzd-well { background: var(--fzd-tint); border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.fzd-drawing { display: block; overflow: visible; }
.fzd-view-label { font-size: 9px; color: var(--fzd-muted); letter-spacing: 0.01em; }

@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .fzd-sheets { gap: 0; display: block; }
  .fzd-page { box-shadow: none; border-radius: 0; margin: 0; break-after: page; page-break-after: always; min-height: calc(var(--fzd-page-h) - 1px); }
  .fzd-page:last-child { break-after: auto; page-break-after: auto; }
  .fzd-editable--on { box-shadow: none !important; background: transparent !important; }
  .fzd-editable--on:empty::before { content: ''; }
}
`

/** CSS completo de documentos para un tema (incluye @page y variables por defecto). */
export function documentCss(theme: DocTheme = DEFAULT_THEME, extraCss = ''): string {
  const paper = PAPER_SIZE[theme.paper] ?? PAPER_SIZE.letter
  return [
    `@page { size: ${paper.css}; margin: 0; }`,
    `.fzd { ${themeVarsCss(theme)} }`,
    BASE_CSS,
    SALES_CSS,
    extraCss,
  ].join('\n')
}
