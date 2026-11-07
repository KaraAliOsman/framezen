/**
 * CSS de confianza del motor de plantillas (prefijo `dkd-`). Todos los valores de marca llegan como
 * variables `--dk-*` desde el tema validado (`templateThemeVars`). La primera parte es la base común;
 * cada composición (`.dkd--c-atelier`, `-corporativa`, `-obra`, `-hogar`, `-memoria`) define después su
 * retícula, sus títulos y sus planillas. Unidades en px CSS (96 dpi): lo que se ve es lo que imprime
 * Chromium. Las etiquetas van en frase y en la tipografía del texto; las cifras, en numerales tabulares.
 */
import { CHROME } from './page'

const BASE_CSS = /* css */ `
.dkd {
  --dk-missing: #8A9396;
  color: var(--dk-ink);
  font-family: var(--dk-font-body);
  font-size: var(--dk-fs-body);
  line-height: var(--dk-lh);
  font-kerning: normal;
  font-optical-sizing: auto;
  font-feature-settings: 'liga' 1, 'kern' 1;
  hanging-punctuation: first;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  display: flex; flex-direction: column; align-items: center; gap: 28px;
}
.dkd *, .dkd *::before, .dkd *::after { box-sizing: border-box; margin: 0; padding: 0; }
.dkd img, .dkd svg { display: block; max-width: none; }
/* Las cotas de los dibujos van en la tipografía del documento. */
.dkd svg text { font-family: var(--dk-font-body) !important; font-variant-numeric: tabular-nums lining-nums; letter-spacing: 0 !important; }
.dkd ul, .dkd ol { list-style: none; }
:where(.dkd) :where(h1, h2, h3, h4, h5) { font-weight: inherit; font-size: inherit; }
:where(.dkd) em { font-style: italic; }
:where(.dkd) strong { font-weight: 600; }
.dkd p, .dkd li { text-wrap: pretty; orphans: 2; widows: 2; }
.dkd h1, .dkd h2, .dkd h3, .dkd h4 { text-wrap: balance; }

/* ── Hoja ───────────────────────────────────────────────────────────────── */
.dkd-page {
  position: relative; width: var(--dk-page-w); height: var(--dk-page-h); overflow: hidden;
  padding: var(--dk-m-top) var(--dk-m-right) var(--dk-m-bottom) var(--dk-m-left);
  display: flex; flex-direction: column; background: var(--dk-paper);
  box-shadow: 0 1px 2px rgb(16 22 24 / .06), 0 14px 36px -18px rgb(16 22 24 / .22);
}
.dkd-page--bleed { padding: 0; }
.dkd-page--lead > .dkd-page__head { display: none; }
.dkd-page__body { flex: 1 1 auto; min-height: 0; display: block; position: relative; }
.dkd-page--cover > .dkd-page__body { display: flex; flex-direction: column; }
.dkd-page__head, .dkd-page__foot { flex: none; }
/* Última hoja: la firma se apoya al pie; el aire queda entre los valores y la firma, no bajo ella. */
.dkd-page__body:has(> .dkd-sec--acceptance) { display: flex; flex-direction: column; }
.dkd-page__body:has(> .dkd-sec--acceptance) > .dkd-block { flex: none; }
.dkd-page__body:has(> .dkd-sec--acceptance)::after { content: ''; flex: 1 1 0; order: 1; }
.dkd-page__body:has(> .dkd-sec--acceptance) > .dkd-sec--acceptance { order: 2; }

/* ── Cabecera corrida y pie ─────────────────────────────────────────────── */
.dkd-run { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; font-size: var(--dk-fs-label); color: var(--dk-muted); line-height: 1.3; }
.dkd-run__brand { display: inline-flex; align-items: center; gap: 8px; min-width: 0; color: var(--dk-ink); }
.dkd-run__context { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
.dkd-run__ref { color: var(--dk-ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.dkd-foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; font-size: var(--dk-fs-label); color: var(--dk-muted); line-height: 1.3; font-variant-numeric: lining-nums; }
.dkd-foot__text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dkd-foot__pn { white-space: nowrap; }
.dkd-foot--left { flex-direction: row-reverse; }
.dkd-foot--left .dkd-foot__text { text-align: right; }
.dkd-foot--center { flex-direction: column; align-items: center; justify-content: flex-end; gap: 2px; }
.dkd-foot--center .dkd-foot__text { text-align: center; }

/* ── Bloques ────────────────────────────────────────────────────────────── */
.dkd-block { position: relative; margin-top: var(--sp, 0); }
.dkd-page__body > .dkd-block:first-child { margin-top: 0; }
.dkd-tone { padding-left: var(--dk-pad); padding-right: var(--dk-pad); }
.dkd-tone--surface { background: var(--dk-surface); }
.dkd-tone--accent { background: var(--dk-accent); color: var(--dk-on-accent); --dk-ink: var(--dk-on-accent); --dk-ink-2: var(--dk-on-accent); --dk-muted: var(--dk-on-accent); --dk-faint: var(--dk-on-accent); --dk-accent-ink: var(--dk-on-accent); --dk-rule: color-mix(in srgb, var(--dk-on-accent) 28%, transparent); }
.dkd-tone--strong { background: var(--dk-strong); color: var(--dk-on-strong); --dk-ink: var(--dk-on-strong); --dk-ink-2: var(--dk-on-strong); --dk-muted: color-mix(in srgb, var(--dk-on-strong) 78%, var(--dk-strong)); --dk-faint: color-mix(in srgb, var(--dk-on-strong) 70%, var(--dk-strong)); --dk-accent-ink: var(--dk-on-strong); --dk-rule: color-mix(in srgb, var(--dk-on-strong) 22%, transparent); }
.dkd-tone.dkd-edge--first, .dkd-tone.dkd-edge--only { padding-top: var(--dk-pad); }
.dkd-tone.dkd-edge--last, .dkd-tone.dkd-edge--only { padding-bottom: var(--dk-pad); }
.dkd-tone.dkd-edge--middle, .dkd-tone.dkd-edge--last { padding-top: var(--tsp, 0); }
.dkd-break { display: block; height: 0; }

/* ── Tipografía y cifras ────────────────────────────────────────────────── */
.dkd-label { display: inline-block; font-size: var(--dk-fs-label); line-height: 1.35; font-weight: var(--dk-label-weight); color: var(--dk-muted); text-transform: var(--dk-label-transform); letter-spacing: var(--dk-label-tracking); }
.dkd-num, .dkd-dim { font-variant-numeric: tabular-nums lining-nums; font-feature-settings: 'tnum' 1, 'lnum' 1, 'kern' 1; white-space: nowrap; }
.dkd-code { font-variant-numeric: lining-nums; }
/* Numerales tabulares sólo donde las cifras se comparan en columna; fechas y datos sueltos, proporcionales. */
.dkd-cs .dkd-num, .dkd-fact .dkd-num, .dkd-lh .dkd-num, .dkd-cover .dkd-num, .dkd-tbl__meta .dkd-num, .dkd-spec .dkd-num, .dkd-spec .dkd-dim { font-variant-numeric: proportional-nums lining-nums; font-feature-settings: 'pnum' 1, 'kern' 1; }
/* La cifra grande de cierre va proporcional y apretada: los numerales tabulares la dejan floja. */
.dkd-tot__grand dd.dkd-num, .dkd-totband__grand .dkd-num, .dkd-decision__figure.dkd-num { font-variant-numeric: proportional-nums lining-nums; font-feature-settings: 'pnum' 1, 'lnum' 1, 'kern' 1; }
.dkd-strong { font-weight: 600; color: var(--dk-ink); }
/* « · » entre partes: el punto vive en el margen de cada parte y el del inicio de línea se recorta. */
.dkd-dots { display: block; overflow: hidden; padding-block: .14em; margin-block: -.14em; }
.dkd-dots__in { display: block; margin-left: -.8em; }
.dkd-dots__part { display: inline-block; position: relative; padding-left: .8em; max-width: calc(100% - 0px); }
.dkd-dots__dot { position: absolute; left: 0; width: .8em; text-align: center; font-weight: 400; color: var(--dk-muted); }
.dkd-muted { color: var(--dk-muted); }
.dkd-small { font-size: var(--dk-fs-small); line-height: 1.45; }
.dkd-right { text-align: right; justify-self: end; }
.dkd-center { text-align: center; }
.dkd-inline { display: inline-flex; align-items: baseline; gap: 5px; min-width: 0; }
.dkd-inline > svg { align-self: center; }
.dkd-rich { display: grid; gap: .55em; }
.dkd-rich h4 { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: 1.12em; line-height: 1.25; color: var(--dk-ink); margin-top: 4px; }
.dkd-rich h5 { font-weight: 600; font-size: 1em; color: var(--dk-ink); margin-top: 2px; }
.dkd-rich ul, .dkd-rich ol { display: grid; gap: 3px; }
.dkd-rich li { position: relative; padding-left: 14px; }
.dkd-rich ul > li::before { content: '–'; position: absolute; left: 0; color: var(--dk-muted); }
.dkd-rich ol { counter-reset: dk-ol; }
.dkd-rich ol > li { counter-increment: dk-ol; padding-left: 20px; }
.dkd-rich ol > li::before { content: counter(dk-ol) '.'; position: absolute; left: 0; font-variant-numeric: tabular-nums; color: var(--dk-muted); }

/* Código de ítem */
.dkd-ref { font-weight: 600; color: var(--dk-ink); white-space: nowrap; font-variant-numeric: tabular-nums lining-nums; }

/* Marca del taller */
.dkd-logo { width: auto; height: auto; object-fit: contain; object-position: left center; }
.dkd-logo--sm { max-height: 20px; max-width: 110px; }
.dkd-logo--md { max-height: 36px; max-width: 160px; }
.dkd-logo--lg { max-height: 56px; max-width: 220px; }
.dkd-logo--xl { max-height: 76px; max-width: 300px; }
.dkd-logo--xxl { max-height: 100px; max-width: 380px; }
.dkd-wordmark { display: inline-block; font-family: var(--dk-font-heading); font-weight: 600; color: var(--dk-ink); letter-spacing: -.012em; line-height: 1.15; }
.dkd-wordmark--sm { font-size: var(--dk-fs-small); font-weight: 600; }
.dkd-wordmark--md { font-size: var(--dk-fs-h3); }
.dkd-wordmark--lg { font-size: calc(var(--dk-fs-h3) * 1.35); }
.dkd-wordmark--xl { font-size: calc(var(--dk-fs-h3) * 1.7); }
.dkd-wordmark--xxl { font-size: calc(var(--dk-fs-h3) * 2.1); }

/* Marcas de perfil y herrajes: imágenes que sube cada taller */
.dkd-marks { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
.dkd-marks--s { gap: 6px 10px; }
.dkd-mark { width: auto; max-width: 180px; object-fit: contain; object-position: left center; }
.dkd-marks--s .dkd-mark { max-width: 84px; }
.dkd-brands { display: flex; align-items: center; padding-top: 2px; }
.dkd-ihead__marks { margin-top: 4px; }

/* Opcionales y partidas */
.dkd-tag { display: block; font-size: var(--dk-fs-label); line-height: 1.35; color: var(--dk-ink-2); font-weight: 600; }
.dkd-tag--off { color: var(--dk-muted); font-weight: 500; }
.dkd-off .dkd-net dd, .dkd-off.dkd-tbl .dkd-num, .dkd-off.dkd-tbl .dkd-dim { color: var(--dk-muted); }
.dkd-off .dkd-well, .dkd-off.dkd-tbl .dkd-tbl__img { opacity: .62; }
.dkd-colornote { font-size: var(--dk-fs-label); line-height: 1.4; color: var(--dk-muted); }
.dkd-scopeline { display: grid; gap: 1px; color: var(--dk-ink); }
.dkd-lines__title { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h3); letter-spacing: var(--dk-heading-tracking); line-height: 1.25; color: var(--dk-ink); padding-top: 4px; }
.dkd-lines { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: 16px; padding: var(--dk-row) 0; border-bottom: .5px solid var(--dk-rule); align-items: baseline; }
.dkd-lines--priced { grid-template-columns: minmax(0, 1fr) 96px; }
.dkd-lines__text { display: grid; min-width: 0; color: var(--dk-ink); }
.dkd-lines__desc { font-size: var(--dk-fs-small); line-height: 1.4; color: var(--dk-muted); }
.dkd-opt { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto 104px; column-gap: 10px; align-items: baseline; padding: 5px 0; border-bottom: .5px solid var(--dk-rule); }
.dkd-opt__mark { width: 9px; height: 9px; border: 1px solid var(--dk-muted); align-self: center; }
.dkd-opt--on .dkd-opt__mark { background: var(--dk-ink); border-color: var(--dk-ink); }
.dkd-opt__text { display: grid; min-width: 0; color: var(--dk-ink); }
.dkd-opt__detail { font-size: var(--dk-fs-small); color: var(--dk-muted); line-height: 1.38; }
.dkd-opt__state { font-size: var(--dk-fs-small); color: var(--dk-muted); white-space: nowrap; }
.dkd-opt__price { text-align: right; font-weight: 600; color: var(--dk-ink); }
.dkd-ghost { color: var(--dk-muted); font-style: italic; }
.dkd-guide { opacity: .55; }
.dkd-glyph { display: inline-flex; align-self: center; }
.dkd-net--pending, .dkd-tbl__pending { font-size: var(--dk-fs-small); font-weight: 600; color: var(--dk-ink-2); line-height: 1.3; text-align: right; }
.dkd-pendnote { font-size: var(--dk-fs-small); font-weight: 600; color: var(--dk-ink); line-height: 1.38; }
.dkd-plan { display: block; max-width: 100%; height: auto; }
.dkd-plate--wide .dkd-plan { grid-column: 2 / -1; }
.dkd-sign__img { max-height: 48px; max-width: 180px; object-fit: contain; object-position: left bottom; }
.dkd-sw { flex: none; }

/* ── Identidad (primera hoja sin portada) ───────────────────────────────── */
.dkd-lh { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 32px; align-items: start; }
.dkd-lh--stacked { grid-template-columns: minmax(0, 1fr); gap: 14px; }
.dkd-lh--stacked .dkd-lh__doc { text-align: left; justify-items: start; }
.dkd-lh--stacked .dkd-lh__dates > div { justify-items: start; }
.dkd-lh--centered { grid-template-columns: minmax(0, 1fr); gap: 14px; text-align: center; justify-items: center; }
.dkd-lh--centered .dkd-lh__brand { justify-items: center; }
.dkd-lh--centered .dkd-lh__doc { text-align: center; justify-items: center; }
.dkd-lh--centered .dkd-lh__dates > div { justify-items: center; }
.dkd-lh__brand { display: grid; gap: 8px; align-content: start; min-width: 0; }
.dkd-lh__org { min-width: 0; }
.dkd-lh__name--sub { font-weight: 600; font-size: var(--dk-fs-small); color: var(--dk-ink); }
.dkd-lh__line { font-size: var(--dk-fs-small); color: var(--dk-muted); line-height: 1.42; }
.dkd-lh__doc { text-align: right; display: grid; justify-items: end; gap: 0; }
.dkd-lh__number { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h2); letter-spacing: var(--dk-heading-tracking); line-height: 1.15; color: var(--dk-ink); }
.dkd-lh__dates { display: grid; grid-auto-flow: column; gap: 16px; margin-top: 6px; font-size: var(--dk-fs-small); }
.dkd-lh__dates > div { display: grid; justify-items: end; }
.dkd-lh__dates dt { color: var(--dk-muted); font-size: var(--dk-fs-label); }
.dkd-lh__dates dd { color: var(--dk-ink); }
.dkd-doctitle__text { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h1); letter-spacing: var(--dk-heading-tracking); line-height: 1.12; color: var(--dk-ink); max-width: 88%; display: block; }

/* ── Títulos de sección ─────────────────────────────────────────────────── */
.dkd-sh { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding-bottom: 8px; border-bottom: max(var(--dk-rule-w), .75px) solid var(--dk-ink); }
.dkd--rules-none .dkd-sh { padding-bottom: 0; border-bottom: 0; }
.dkd-sh__main { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.dkd-sh__kicker { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h2); color: var(--dk-muted); font-variant-numeric: tabular-nums lining-nums; }
.dkd-sh__title { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h2); letter-spacing: var(--dk-heading-tracking); line-height: 1.2; color: var(--dk-ink); }
.dkd-sh__aside { font-size: var(--dk-fs-label); color: var(--dk-muted); text-align: right; white-space: nowrap; }

/* ── Pares y datos ──────────────────────────────────────────────────────── */
.dkd-facts { display: grid; column-gap: 24px; row-gap: 12px; }
.dkd-facts--c1 { grid-template-columns: minmax(0, 1fr); }
.dkd-facts--c2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.dkd-facts--c3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.dkd-facts--c4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.dkd-fact { display: grid; gap: 1px; align-content: start; min-width: 0; }
.dkd-fact dd { color: var(--dk-ink); }
.dkd-facts--row { padding-top: 12px; margin-top: 4px; }
.dkd-facts--foot { margin-top: 10px; }

/* ── Dibujo ─────────────────────────────────────────────────────────────── */
.dkd-well { position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; flex: none; }
.dkd-well--inset { justify-content: flex-start; }
.dkd-well__inset { position: absolute; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; background: var(--dk-paper); }
.dkd-well__inset > span { font-size: 8.5px; color: var(--dk-muted); }
.dkd-figure { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.dkd-figure figcaption { font-size: var(--dk-fs-label); color: var(--dk-muted); }

/* Dibujo que se achica para caber (el espacio lo decide el diseño, no una estimación). */
.dkd-fit { position: relative; flex: 1 1 0; min-height: 0; min-width: 0; width: 100%; align-self: stretch; }
.dkd-fit__in { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.dkd-fit svg { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; }

/* ── Ítems ──────────────────────────────────────────────────────────────── */
.dkd-ihead { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.dkd-ihead__ref { font-weight: 600; color: var(--dk-muted); flex: none; }
.dkd-ihead__text { min-width: 0; display: grid; gap: 1px; }
.dkd-ihead__title { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h3); letter-spacing: var(--dk-heading-tracking); line-height: 1.25; color: var(--dk-ink); }
.dkd-ihead__sub { font-size: var(--dk-fs-small); color: var(--dk-muted); line-height: 1.4; }
.dkd-note { font-size: var(--dk-fs-small); line-height: 1.45; color: var(--dk-ink-2); }
.dkd-specs { display: grid; column-gap: 18px; row-gap: 6px; }
.dkd-specs--c1 { grid-template-columns: minmax(0, 1fr); row-gap: 5px; }
.dkd-specs--c2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.dkd-specs--c3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.dkd-spec { display: grid; gap: 0; min-width: 0; align-content: start; }
.dkd-spec dd { font-size: var(--dk-fs-small); line-height: 1.38; color: var(--dk-ink); min-width: 0; }
.dkd-specs--c1 .dkd-spec { grid-template-columns: 84px minmax(0, 1fr); gap: 8px; align-items: first baseline; }
.dkd-net { display: grid; justify-items: end; gap: 1px; }
.dkd-net dd { font-weight: 600; color: var(--dk-ink); line-height: 1.25; }
.dkd-net__unit { font-size: var(--dk-fs-small); font-weight: 400 !important; color: var(--dk-muted) !important; }

/* Panel horizontal (tarjeta a una columna) */
.dkd-panel { display: grid; column-gap: 24px; align-items: start; padding: var(--dk-row) 0; }
.dkd-panel__body { display: grid; gap: 12px; min-width: 0; padding-top: 4px; }

/* Tarjetas y galería */
.dkd-cards { display: grid; align-items: stretch; }
.dkd-cards__cell { min-width: 0; display: flex; }
.dkd-card { display: flex; flex-direction: column; width: 100%; }
.dkd-card .dkd-well { width: 100% !important; }
.dkd-card__body { display: grid; gap: 8px; padding-top: 10px; align-content: start; }
.dkd-card__top { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: start; }
.dkd-card__foot { font-size: var(--dk-fs-small); color: var(--dk-muted); }
.dkd-gal { display: flex; flex-direction: column; width: 100%; }
.dkd-gal .dkd-well { width: 100% !important; }
.dkd-gal__body { display: grid; gap: 4px; padding-top: 10px; }
.dkd-gal__top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dkd-gal__ref { font-weight: 600; color: var(--dk-muted); }
.dkd-gal__title { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h3); letter-spacing: var(--dk-heading-tracking); line-height: 1.2; }
.dkd-gal__meta { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: var(--dk-fs-small); color: var(--dk-muted); margin-bottom: 4px; }

/* Lámina */
.dkd-plate { display: grid; column-gap: 0; min-height: 0; }
.dkd-plate__side { display: flex; flex-direction: column; gap: 18px; min-width: 0; padding-right: 20px; }
.dkd-plate__id { display: grid; gap: 3px; }
.dkd-plate__ref { font-weight: 500; color: var(--dk-muted); font-size: var(--dk-fs-body); }
.dkd-plate__title { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h2); letter-spacing: var(--dk-heading-tracking); line-height: 1.14; color: var(--dk-ink); }
.dkd-plate__sub { font-size: var(--dk-fs-small); color: var(--dk-muted); }
.dkd-plate .dkd-net { justify-items: start; margin-top: auto; }
.dkd-plate__stage { display: flex; min-height: 0; min-width: 0; }
.dkd-plate__stage .dkd-fit__in { align-items: flex-end; justify-content: flex-end; }
.dkd-plate--wide { display: flex; flex-direction: column-reverse; justify-content: flex-end; gap: 24px; }
.dkd-plate--wide .dkd-plate__stage { flex: none; width: 100%; }
.dkd-plate--wide .dkd-plate__stage .dkd-fit__in { align-items: stretch; justify-content: center; }
.dkd-plate--wide .dkd-plate__side { display: grid; grid-template-columns: 1fr 2fr; grid-template-rows: auto minmax(0, 1fr); column-gap: 0; row-gap: 12px; padding-right: 0; flex: 1 1 0; min-height: 0; }
.dkd-plate--wide .dkd-plate__id { padding-right: 20px; grid-column: 1; grid-row: 1; align-content: start; }
.dkd-plate--wide .dkd-specs { grid-column: 2; grid-row: 1; row-gap: 12px; }
.dkd-plate--wide .dkd-note { grid-column: 2; grid-row: 2; }
.dkd-plate--wide .dkd-net { grid-column: 1; grid-row: 2; align-self: end; margin-top: 0; }
.dkd-plate--compact { overflow: hidden; }
.dkd-plate--compact .dkd-plate__side { gap: 10px; }
.dkd-plate--compact .dkd-plate__title { font-size: var(--dk-fs-h3); }
.dkd-plate--compact .dkd-plate__stage .dkd-fit__in { align-items: center; }

/* Ficha */
.dkd-fiche { display: flex; flex-direction: column; min-height: 0; }
.dkd-fiche__head { flex: none; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 16px; align-items: baseline; padding-bottom: 8px; border-bottom: 1.5px solid var(--dk-ink); }
.dkd-fiche__ref { font-family: var(--dk-font-heading); font-weight: 700; font-size: var(--dk-fs-h1); line-height: 1; color: var(--dk-ink); }
.dkd-fiche__title { display: flex; gap: 12px; align-items: baseline; min-width: 0; }
.dkd-fiche__title h3 { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h3); line-height: 1.2; }
.dkd-fiche__title span { font-size: var(--dk-fs-small); color: var(--dk-muted); }
.dkd-fiche__size { font-size: var(--dk-fs-h3); font-weight: 600; }
.dkd-fiche__body { flex: 1 1 0; min-height: 0; display: grid; column-gap: 24px; padding-top: 14px; }
.dkd-fiche__main { display: flex; flex-direction: column; gap: 6px; min-height: 0; min-width: 0; }
.dkd-fiche__main figcaption, .dkd-fiche__ext figcaption { flex: none; font-size: var(--dk-fs-label); color: var(--dk-muted); }
.dkd-fiche__side { display: flex; flex-direction: column; gap: 14px; min-width: 0; min-height: 0; }
.dkd-fiche__ext { display: grid; gap: 4px; justify-items: start; }
.dkd-fiche .dkd-net { justify-items: start; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--dk-rule); width: 100%; gap: 2px; }
.dkd-fiche--narrow .dkd-fiche__body { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; row-gap: 10px; }
.dkd-fiche--narrow .dkd-fiche__side { gap: 8px; }
.dkd-fiche--narrow .dkd-fiche .dkd-net, .dkd-fiche--narrow .dkd-net { margin-top: 0; }
.dkd-fiches { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; height: 100%; }

/* Planilla */
.dkd-tbl { display: grid; column-gap: 12px; align-items: start; }
.dkd-tbl--head { padding-bottom: 5px; border-bottom: 1px solid var(--dk-ink); align-items: end; }
.dkd-tbl--row { padding: var(--dk-row) 0; border-bottom: .5px solid var(--dk-rule); font-size: var(--dk-fs-small); }
.dkd-tbl__ref { font-weight: 600; color: var(--dk-ink); }
.dkd-tbl__img { display: flex; align-items: center; justify-content: center; }
.dkd-tbl__desc { display: grid; gap: 0; min-width: 0; }
.dkd-tbl__name { font-weight: 600; color: var(--dk-ink); line-height: 1.3; font-size: var(--dk-fs-small); }
.dkd-tbl__loc { font-weight: 400; color: var(--dk-muted); }
.dkd-tbl__meta { display: block; color: var(--dk-muted); line-height: 1.38; }
.dkd-tbl__meta .dkd-inline { display: inline; }
.dkd-tbl__meta .dkd-inline .dkd-sw, .dkd-tbl__meta .dkd-inline svg { display: none; }
.dkd-tbl__note { color: var(--dk-ink-2); }
.dkd-group { display: flex; align-items: baseline; gap: 10px; padding: 9px 0 5px; }
.dkd-group__name { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h3); letter-spacing: var(--dk-heading-tracking); color: var(--dk-ink); }
.dkd-group__count { font-size: var(--dk-fs-small); color: var(--dk-muted); }
.dkd-gsub { display: flex; justify-content: flex-end; gap: 18px; padding: 6px 0; font-size: var(--dk-fs-small); color: var(--dk-ink-2); }
.dkd-gsub .dkd-num { font-weight: 600; color: var(--dk-ink); min-width: 90px; text-align: right; }

/* ── Datos del cliente ──────────────────────────────────────────────────── */
.dkd-cs { display: grid; column-gap: 20px; row-gap: 0; }
.dkd-cs__cell { display: grid; gap: 1px; align-content: start; min-width: 0; }
.dkd-cs__value { display: grid; color: var(--dk-ink); line-height: 1.35; overflow-wrap: break-word; }
.dkd-cs__cell--wide { grid-column: span 2; }
.dkd-cs--strip { padding: 10px 0; }
.dkd-cs--grid { row-gap: 10px; }
.dkd-cs--band { padding: 2px 0; }

/* ── Carta ──────────────────────────────────────────────────────────────── */
.dkd-letter { max-width: 600px; color: var(--dk-ink); }
.dkd-letter--note { max-width: 620px; color: var(--dk-ink); }
.dkd-letter__date { font-size: var(--dk-fs-small); color: var(--dk-muted); margin-bottom: 14px; }
.dkd-letter__greet { color: var(--dk-ink); }
.dkd-letter__sign { display: grid; gap: 1px; }
.dkd-letter__sign p { margin-bottom: 8px; }
.dkd-letter__name { font-weight: 600; color: var(--dk-ink); }

/* ── Resumen ────────────────────────────────────────────────────────────── */
.dkd-figs { display: grid; column-gap: 24px; }
.dkd-figs__cell { display: grid; gap: 2px; align-content: start; }
.dkd-figs__cell dd { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h2); letter-spacing: var(--dk-heading-tracking); line-height: 1.15; color: var(--dk-ink); }
.dkd-lead-time { color: var(--dk-ink); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: baseline; }
.dkd-scope { display: grid; gap: 8px; }
.dkd-checks { display: grid; gap: 4px; }
.dkd-checks li { position: relative; padding-left: 18px; color: var(--dk-ink); }
.dkd-checks li::before { content: ''; position: absolute; left: 1px; top: .42em; width: 9px; height: 4.5px; border-left: 1.4px solid var(--dk-ink); border-bottom: 1.4px solid var(--dk-ink); transform: rotate(-45deg); }
.dkd-index { display: grid; grid-template-columns: 44px minmax(0, 1fr) 124px 40px; column-gap: 12px; align-items: baseline; padding: calc(var(--dk-row) * .5) 0; border-bottom: .5px solid var(--dk-rule); }
.dkd-index__name { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; min-width: 0; line-height: 1.35; }
.dkd-index__name > span:first-child { color: var(--dk-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dkd-index__name .dkd-muted { font-size: var(--dk-fs-small); white-space: nowrap; }
.dkd-index__qty { color: var(--dk-muted); }
.dkd-index__group { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 4px; border-bottom: .75px solid var(--dk-ink); font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h3); color: var(--dk-ink); }
.dkd-index__group .dkd-muted { font-family: var(--dk-font-body); font-weight: 400; font-size: var(--dk-fs-small); }

/* ── Totales ────────────────────────────────────────────────────────────── */
.dkd-totwrap { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 340px); gap: 32px; align-items: end; }
.dkd-totwrap__side { display: grid; gap: 12px; align-content: end; min-height: 100%; min-width: 0; }
.dkd-totpay { display: grid; align-self: start; }
.dkd-totpay__title { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h3); line-height: 1.25; color: var(--dk-ink); padding-bottom: 6px; border-bottom: 1px solid var(--dk-ink); }
.dkd-totpay__row { display: grid; grid-template-columns: minmax(0, 1fr) 46px 96px; gap: 10px; padding: 5px 0; border-bottom: .5px solid var(--dk-rule); color: var(--dk-ink); font-size: var(--dk-fs-small); }
.dkd-totwrap__note { display: grid; gap: 4px; font-size: var(--dk-fs-small); color: var(--dk-muted); padding-bottom: 6px; }
.dkd-tot { display: grid; }
.dkd-tot__row { display: flex; justify-content: space-between; gap: 18px; padding: 3px 0; line-height: 1.4; }
.dkd-tot__row dt { color: var(--dk-ink); }
.dkd-tot__row dd { color: var(--dk-ink); }
.dkd-tot__row--muted dt, .dkd-tot__row--muted dd { color: var(--dk-muted); font-size: var(--dk-fs-small); }
.dkd-tot__row--net { margin-top: 3px; padding-top: 6px; border-top: .75px solid var(--dk-rule); }
.dkd-tot__grand { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-top: 8px; padding-top: 10px; border-top: 1.5px solid var(--dk-ink); }
.dkd-tot__grand dt { font-weight: 600; color: var(--dk-ink); }
.dkd-tot__grand dd { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-figure); letter-spacing: -.022em; line-height: 1; color: var(--dk-ink); white-space: nowrap; }
.dkd-totband { display: grid; gap: 22px; }
.dkd-totband__cells { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; }
.dkd-totband__cells > div { display: flex; justify-content: space-between; gap: 18px; padding: 5px 0; border-bottom: .5px solid var(--dk-rule); }
.dkd-totband__cells dt { font-size: var(--dk-fs-body); color: var(--dk-ink); letter-spacing: 0; }
.dkd-totband__cells dd { color: var(--dk-ink); }
.dkd-totband__grand { display: grid; gap: 4px; }
.dkd-totband__grand .dkd-num { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-figure); letter-spacing: -.024em; line-height: 1; color: var(--dk-ink); }
.dkd-decision { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(240px, 1fr); gap: 40px; align-items: start; }
.dkd-decision__main { display: grid; gap: 6px; align-content: start; }
.dkd-decision__figure { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-figure); letter-spacing: -.02em; line-height: 1.05; color: var(--dk-ink); margin-top: 2px; }
.dkd-decision__tax { font-size: var(--dk-fs-small); color: var(--dk-muted); margin-bottom: 12px; }
.dkd-decision__inc { margin-top: 4px; }
.dkd-decision__next { margin-top: 8px; font-size: var(--dk-fs-small); color: var(--dk-ink); }
.dkd-decision .dkd-tot__grand dd { font-size: var(--dk-fs-h3); font-family: var(--dk-font-body); font-weight: 600; letter-spacing: 0; }

/* ── Forma de pago ──────────────────────────────────────────────────────── */
.dkd-pay { display: grid; gap: 10px; color: var(--dk-ink); }
.dkd-pay__plan { display: grid; gap: 2px; max-width: 460px; }
.dkd-pay__plan li { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: 10px; align-items: baseline; color: var(--dk-ink); }
.dkd-pay__pct { font-weight: 600; }
.dkd-bank { display: grid; column-gap: 24px; padding-top: 10px; }
.dkd-bank__plan { padding-top: 8px; }
.dkd-bank__acct { display: grid; gap: 2px; align-content: start; font-size: var(--dk-fs-small); color: var(--dk-ink); }
.dkd-bank__row { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 10px; }
.dkd-bank__row dt { color: var(--dk-muted); }
.dkd-bank__row dd { overflow-wrap: anywhere; font-weight: 500; }
.dkd-bank__links { display: grid; gap: 3px; padding-top: 10px; font-size: var(--dk-fs-small); color: var(--dk-ink); }
.dkd-bank__links a { color: var(--dk-muted); overflow-wrap: anywhere; }
.dkd-bank__note { padding-top: 10px; font-size: var(--dk-fs-small); color: var(--dk-muted); white-space: pre-line; overflow-wrap: anywhere; }
.dkd-paytl { display: grid; gap: 10px; }
.dkd-paytl__steps { display: grid; column-gap: 20px; }
.dkd-paytl__step { display: grid; gap: 1px; align-content: start; padding-top: 8px; border-top: 1px solid var(--dk-ink); }
.dkd-paytl__pct { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h2); letter-spacing: var(--dk-heading-tracking); line-height: 1.15; color: var(--dk-ink); }
.dkd-paytl__label { font-size: var(--dk-fs-small); color: var(--dk-ink); line-height: 1.35; }
.dkd-paytl__amount { font-weight: 600; color: var(--dk-ink); }
.dkd-paytl__text { display: none; font-size: var(--dk-fs-small); color: var(--dk-muted); }
.dkd-paytbl { display: grid; }
.dkd-paytbl__row { display: grid; grid-template-columns: minmax(0, 1fr) 64px 120px; gap: 14px; padding: 5px 0; border-bottom: .5px solid var(--dk-rule); }
.dkd-paytbl__row--head { border-bottom: 1px solid var(--dk-ink); padding-top: 0; }
.dkd-paytbl__text { padding-top: 8px; font-size: var(--dk-fs-small); color: var(--dk-muted); }

/* ── Condiciones y garantía ─────────────────────────────────────────────── */
.dkd-terms { color: var(--dk-ink); }
.dkd-terms--cols { column-count: 2; column-gap: 28px; }
.dkd-terms__part { break-inside: avoid; }
.dkd-term { break-inside: avoid; padding-bottom: 10px; font-size: calc(var(--dk-fs-small) * 1.05); line-height: 1.48; }
.dkd-term__title { font-weight: 600; font-size: inherit; color: var(--dk-ink); margin-bottom: 2px; display: flex; gap: 6px; }
.dkd-term__n { font-variant-numeric: tabular-nums lining-nums; color: var(--dk-muted); font-weight: 400; }
.dkd-terms--compact .dkd-term { font-size: var(--dk-fs-small); padding-bottom: 5px; }
.dkd-terms--numbered .dkd-term { padding: 0 0 9px; }
.dkd-warr { display: grid; color: var(--dk-ink); }
.dkd-warr--plain { gap: 6px; }
.dkd-warr__row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; padding: 5px 0; border-bottom: .5px solid var(--dk-rule); color: var(--dk-ink); }
.dkd-warr__row--head { border-bottom: 1px solid var(--dk-ink); padding-top: 0; }
.dkd-warr__years { font-weight: 600; }
.dkd-warr__rest, .dkd-warr__service { font-size: var(--dk-fs-small); color: var(--dk-muted); padding-top: 6px; }

/* ── Aceptación ─────────────────────────────────────────────────────────── */
.dkd-acc { display: grid; grid-template-columns: minmax(0, 1fr); gap: 28px; align-items: start; }
.dkd-acc--qr { grid-template-columns: minmax(0, 1fr) 200px; }
.dkd-acc__main { display: grid; gap: 14px; align-content: start; }
.dkd-acc__statement { color: var(--dk-ink); }
.dkd-acc__by { font-size: var(--dk-fs-small); color: var(--dk-ink); }
.dkd-acc__online { display: grid; gap: 6px; justify-items: start; }
.dkd-acc--online_only .dkd-acc__online { grid-template-columns: auto minmax(0, 260px); gap: 12px; }
.dkd-acc__online-text { display: grid; gap: 1px; color: var(--dk-ink); font-size: var(--dk-fs-small); line-height: 1.38; }
.dkd-acc__online-text .dkd-small { color: var(--dk-muted); overflow-wrap: anywhere; }
.dkd-acc--accepted { display: flex; gap: 12px; align-items: flex-start; }
.dkd-acc__check { width: 20px; height: 20px; flex: none; color: var(--dk-ink); }
.dkd-sign { display: grid; grid-template-columns: 1.25fr 1.25fr .8fr; gap: 20px; align-items: start; }
.dkd-sign--company { grid-template-columns: minmax(0, 1fr); max-width: 52%; }
.dkd-sign__field { display: grid; gap: 4px; min-width: 0; }
.dkd-sign__space { display: block; height: 44px; border-bottom: 1px solid var(--dk-ink); }
.dkd-acc--inline .dkd-sign__space { height: 30px; }
.dkd-qr { display: block; }

/* ── Quiénes somos, galería, texto libre ────────────────────────────────── */
.dkd-about { display: grid; gap: 28px; align-items: start; }
.dkd-about--image { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); }
.dkd-about__text { display: grid; gap: 10px; color: var(--dk-ink); max-width: 620px; }
.dkd-about__img { width: 100%; height: 240px; object-fit: cover; }
.dkd-imgs { display: grid; column-gap: 14px; }
.dkd-imgs figure { display: grid; gap: 6px; min-width: 0; }
.dkd-imgs figcaption { font-size: var(--dk-fs-label); color: var(--dk-muted); }
.dkd-img { width: 100%; object-fit: cover; display: block; }
.dkd--img-framed .dkd-img { padding: 6px; background: var(--dk-paper); border: 1px solid var(--dk-rule); }
.dkd--img-monochrome .dkd-img { filter: grayscale(1) contrast(1.04); }
.dkd-ct { color: var(--dk-ink); }
.dkd-ct--callout { padding: 12px 16px; background: var(--dk-surface); }
.dkd-ct--two_columns .dkd-rich { display: block; column-count: 2; column-gap: 28px; }
.dkd-ct--two_columns .dkd-rich > * { break-inside: avoid; margin-bottom: 6px; }

/* ── Especificaciones y terminaciones ───────────────────────────────────── */
.dkd-mx { display: grid; column-gap: 14px; align-items: start; padding: var(--dk-row) 0; border-bottom: .5px solid var(--dk-rule); font-size: var(--dk-fs-small); line-height: 1.4; color: var(--dk-ink); }
.dkd-mx > span { min-width: 0; }
.dkd-mx--head { padding-top: 0; padding-bottom: 5px; border-bottom: 1px solid var(--dk-ink); }
.dkd-mx__sub { display: block; color: var(--dk-muted); }
.dkd-layers { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 22px; align-items: center; padding: 10px 0; border-bottom: .5px solid var(--dk-rule); }
.dkd-layers--plain { grid-template-columns: minmax(0, 1fr); }
.dkd-layers__svg { overflow: visible; }
.dkd-layers__side { font-family: var(--dk-font-body); font-size: 8.5px; fill: var(--dk-muted); }
.dkd-layers__pane { fill: color-mix(in srgb, #8FC3C8 70%, var(--dk-paper)); stroke: color-mix(in srgb, #4E8E95 80%, var(--dk-ink)); stroke-width: .6; }
.dkd-layers__inter { fill: color-mix(in srgb, var(--dk-accent) 35%, var(--dk-paper)); }
.dkd-layers__cavity { fill: color-mix(in srgb, #DDEFF1 60%, var(--dk-paper)); }
.dkd-layers__spacer { fill: color-mix(in srgb, var(--dk-ink) 55%, var(--dk-paper)); }
.dkd-layers__text { display: grid; gap: 4px; }
.dkd-layers__name { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h3); letter-spacing: var(--dk-heading-tracking); }
.dkd-layers__facts { display: grid; gap: 2px; color: var(--dk-ink); }
.dkd-hwline { color: var(--dk-ink); }
.dkd-sources { font-size: var(--dk-fs-small); color: var(--dk-muted); }
.dkd-fin { display: grid; gap: 16px; }
.dkd-fin__cell { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; min-width: 0; }
.dkd-fin--board .dkd-fin__cell { grid-template-columns: minmax(0, 1fr); gap: 10px; align-items: start; }
.dkd-fin__cell figcaption { display: grid; gap: 1px; min-width: 0; }
.dkd-fin__name { font-weight: 600; color: var(--dk-ink); }
.dkd-fin--board .dkd-fin__name { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-h3); }
.dkd-fin__code { font-size: var(--dk-fs-label); color: var(--dk-muted); }
.dkd-fin__use { font-size: var(--dk-fs-small); color: var(--dk-muted); }

/* ── Portada ────────────────────────────────────────────────────────────── */
.dkd-cover { position: relative; display: flex; flex-direction: column; width: 100%; overflow: hidden; }
.dkd-cover--bleed { width: var(--dk-page-w); }
.dkd-cover__mast { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.dkd-cover__legal { font-size: var(--dk-fs-label); color: var(--dk-muted); line-height: 1.35; text-align: right; }
.dkd-cover__stage { flex: 1 1 0; min-height: 0; display: flex; align-items: center; justify-content: center; }
.dkd-cover__photo { flex: 1 1 0; min-height: 0; width: 100%; object-fit: cover; display: block; }
.dkd-cover__foot { margin-top: auto; flex: none; display: grid; gap: 32px; }
.dkd-cover__titles { display: grid; gap: 10px; }
.dkd-cover__title { font-family: var(--dk-font-heading); font-weight: var(--dk-heading-weight); font-size: var(--dk-fs-display); letter-spacing: -.024em; line-height: 1.04; color: var(--dk-ink); overflow-wrap: anywhere; text-wrap: balance; }
.dkd-cover--tm .dkd-cover__title { font-size: calc(var(--dk-fs-display) * .78); line-height: 1.08; }
.dkd-cover--ts .dkd-cover__title { font-size: calc(var(--dk-fs-display) * .58); line-height: 1.12; }
.dkd-cover__subtitle { font-size: calc(var(--dk-fs-body) * 1.2); color: var(--dk-muted); }
.dkd-cover__facts { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); column-gap: 20px; }
.dkd-cover__fact { display: grid; gap: 1px; align-content: start; min-width: 0; }
.dkd-cover__fact dd { color: var(--dk-ink); line-height: 1.35; overflow-wrap: anywhere; }
.dkd-elev { display: flex; align-items: flex-end; justify-content: center; gap: 24px; width: 100%; }
`

/**
 * Atelier: una sola familia en dos pesos, seis columnas y un tercio de la hoja para el margen. Los
 * títulos se sientan en esa columna y el contenido arranca en la tercera. Casi sin líneas: ordena el aire.
 */
const ATELIER_CSS = /* css */ `
.dkd--c-atelier .dkd-sh--side { position: absolute; left: 0; top: 0; width: calc(var(--dk-side) - 20px); display: block; padding: 0; border: 0; }
.dkd--c-atelier .dkd-sh--side .dkd-sh__title { font-size: var(--dk-fs-body); font-weight: 500; line-height: var(--dk-lh); letter-spacing: 0; }
.dkd--c-atelier .dkd-sh--side .dkd-sh__aside { display: none; }
.dkd--c-atelier .dkd-block:not(.dkd-sec--items):not(.dkd-sec--cover) { padding-left: var(--dk-side); }
.dkd--c-atelier .dkd-letter, .dkd--c-atelier .dkd-letter--note { max-width: none; font-size: calc(var(--dk-fs-body) * 1.1); line-height: 1.52; }
.dkd--c-atelier .dkd-letter__date { font-size: var(--dk-fs-body); }
.dkd--c-atelier .dkd-letter__name { font-weight: 500; }
.dkd--c-atelier .dkd-index { grid-template-columns: 34px minmax(0, 1fr) 118px; padding: 4px 0; }
.dkd--c-atelier .dkd-index__qty { display: none; }
.dkd--c-atelier .dkd-index__name .dkd-muted { display: none; }
.dkd--c-atelier .dkd-facts--foot { padding-top: 6px; }
.dkd--c-atelier .dkd-lead-time { font-size: var(--dk-fs-small); }
.dkd--c-atelier .dkd-specs--c1 { row-gap: 7px; }
.dkd--c-atelier .dkd-specs--c1 .dkd-spec { grid-template-columns: minmax(0, 1fr); gap: 0; }
.dkd--c-atelier .dkd-plate__title { font-weight: 500; }
.dkd--c-atelier .dkd-term { font-size: var(--dk-fs-body); line-height: var(--dk-lh); padding-bottom: 12px; }
.dkd--c-atelier .dkd-term__title { font-weight: 500; }
.dkd--c-atelier .dkd-term__n { display: none; }
.dkd--c-atelier .dkd-totband { gap: 26px; }
.dkd--c-atelier .dkd-totband__grand { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; }
.dkd--c-atelier .dkd-totband__grand .dkd-label { font-size: var(--dk-fs-body); font-weight: 500; color: var(--dk-ink); }
.dkd--c-atelier .dkd-totband__grand .dkd-num { font-weight: 500; }
.dkd--c-atelier .dkd-foot { color: var(--dk-muted); }
/* Firma a todo el ancho de la columna; el código queda debajo, en una fila. */
.dkd--c-atelier .dkd-acc--qr { grid-template-columns: minmax(0, 1fr); gap: 20px; }
.dkd--c-atelier .dkd-acc__online { grid-template-columns: auto minmax(0, 320px); gap: 16px; align-items: center; }
/* Portada */
.dkd--c-atelier .dkd-cover__foot { padding-left: var(--dk-side); gap: 44px; }
.dkd--c-atelier .dkd-cover__title { font-weight: 500; }
.dkd--c-atelier .dkd-cover__facts { padding-top: 0; grid-auto-flow: row; grid-template-columns: minmax(0, 1.5fr) minmax(0, .8fr) minmax(0, 1fr); }
.dkd--c-atelier .dkd-cover__fact dt { font-size: var(--dk-fs-small); }
.dkd--c-atelier .dkd-cover__fact dd { font-size: var(--dk-fs-small); }
.dkd--c-atelier .dkd-tbl--head { border-bottom-width: .75px; }
`

/**
 * Corporativa: dos familias con trabajos fijos (Public Sans para estructura y cifras, Source Serif 4 para
 * leer), capítulos numerados con filete de color y cuadros con encabezado claro. Portada con campo de
 * color inferior: el logo queda sobre blanco, donde cualquier logo funciona.
 */
const CORPORATIVA_CSS = /* css */ `
.dkd--c-corporativa .dkd-label, .dkd--c-corporativa .dkd-run, .dkd--c-corporativa .dkd-foot, .dkd--c-corporativa .dkd-tbl, .dkd--c-corporativa .dkd-cs, .dkd--c-corporativa .dkd-facts, .dkd--c-corporativa .dkd-tot, .dkd--c-corporativa .dkd-paytbl, .dkd--c-corporativa .dkd-warr__row, .dkd--c-corporativa .dkd-group, .dkd--c-corporativa .dkd-gsub, .dkd--c-corporativa .dkd-sign, .dkd--c-corporativa .dkd-acc__online-text, .dkd--c-corporativa .dkd-lead-time { font-family: var(--dk-font-heading); }
.dkd--c-corporativa .dkd-sh { border-bottom: 0; border-top: 2px solid var(--dk-accent); padding: 8px 0 0; }
.dkd--c-corporativa .dkd-sh__kicker { color: var(--dk-accent); min-width: 22px; }
.dkd--c-corporativa .dkd-sh__title { color: var(--dk-accent); }
.dkd--c-corporativa .dkd-sh + * { margin-top: 0; }
.dkd--c-corporativa .dkd-run { padding-bottom: 7px; border-bottom: .75px solid var(--dk-rule); }
.dkd--c-corporativa .dkd-cs--grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; padding-top: 4px; row-gap: 12px; }
.dkd--c-corporativa .dkd-tbl--head { padding: 6px 8px; background: var(--dk-surface); border-bottom: 0; }
.dkd--c-corporativa .dkd-tbl--row { padding-left: 8px; padding-right: 8px; align-items: center; }
.dkd--c-corporativa .dkd-tbl--row .dkd-num { font-size: var(--dk-fs-small); }
.dkd--c-corporativa .dkd-tbl--row .dkd-num, .dkd--c-corporativa .dkd-gsub .dkd-num, .dkd--c-corporativa .dkd-tot__row dd, .dkd--c-corporativa .dkd-paytbl .dkd-num { letter-spacing: -.012em; }
.dkd--c-corporativa .dkd-group { padding: 12px 8px 5px; border-bottom: 1px solid var(--dk-accent); }
.dkd--c-corporativa .dkd-group__name { color: var(--dk-accent); font-size: var(--dk-fs-body); font-weight: 600; letter-spacing: 0; }
.dkd--c-corporativa .dkd-gsub { padding: 6px 8px; font-size: var(--dk-fs-small); }
.dkd--c-corporativa .dkd-term { font-size: var(--dk-fs-body); line-height: var(--dk-lh); }
.dkd--c-corporativa .dkd-term__title { font-family: var(--dk-font-heading); font-size: var(--dk-fs-small); }
.dkd--c-corporativa .dkd-term__n { color: var(--dk-accent); min-width: 22px; }
.dkd--c-corporativa .dkd-terms--numbered .dkd-term__body { padding-left: 28px; }
.dkd--c-corporativa .dkd-terms--tight .dkd-term { font-size: var(--dk-fs-small); line-height: 1.42; padding-bottom: 6px; }
.dkd--c-corporativa .dkd-tot__grand dd { color: var(--dk-accent); }
.dkd--c-corporativa .dkd-totwrap { grid-template-columns: minmax(0, 1fr) 340px; gap: 40px; }
.dkd--c-corporativa .dkd-totpay, .dkd--c-corporativa .dkd-totwrap__note { font-family: var(--dk-font-heading); }
.dkd--c-corporativa .dkd-totpay__title { color: var(--dk-accent); }
/* Portada */
.dkd--c-corporativa .dkd-cover--field .dkd-cover__mast { padding: 18mm var(--cv-x) 0; }
.dkd--c-corporativa .dkd-cover--field .dkd-cover__foot { min-height: 44%; padding: 14mm var(--cv-x) 16mm; background: var(--dk-strong); grid-template-rows: minmax(0, 1fr) auto; gap: 24px; --dk-ink: var(--dk-on-strong); --dk-muted: color-mix(in srgb, var(--dk-on-strong) 72%, var(--dk-strong)); }
.dkd--c-corporativa .dkd-cover__title { font-weight: 600; letter-spacing: -.018em; }
.dkd--c-corporativa .dkd-cover__legal { font-family: var(--dk-font-heading); }
.dkd--c-corporativa .dkd-cover__fact dt { font-family: var(--dk-font-heading); }
.dkd--c-corporativa .dkd-cover__fact dd { font-family: var(--dk-font-heading); font-size: var(--dk-fs-small); }
`

/**
 * Obra: Archivo semicondensado, encabezado negro de planilla y filas densas. Pensada para leerse en una
 * tablilla: columnas fijas, código fuerte y nada que no sea dato.
 */
const OBRA_CSS = /* css */ `
.dkd--c-obra { font-stretch: 90%; letter-spacing: .002em; }
.dkd--c-obra .dkd-page__head { height: 18px; margin-bottom: 8px; }
.dkd--c-obra .dkd-run { padding-bottom: 3px; border-bottom: 1.5px solid var(--dk-ink); font-size: var(--dk-fs-label); }
.dkd--c-obra .dkd-lh { padding-bottom: 8px; border-bottom: 3px solid var(--dk-ink); align-items: end; grid-template-columns: minmax(0, 1fr) auto; }
.dkd--c-obra .dkd-lh__brand { grid-template-columns: auto minmax(0, 1fr); gap: 14px; align-items: end; }
.dkd--c-obra .dkd-logo--lg { max-height: 38px; max-width: 170px; }
.dkd--c-obra .dkd-lh__line { font-size: var(--dk-fs-label); }
.dkd--c-obra .dkd-lh { gap: 14px; }
.dkd--c-obra .dkd-lh__brand { gap: 12px; }
.dkd--c-obra .dkd-logo--lg { max-width: 150px; }
.dkd--c-obra .dkd-term { text-wrap: pretty; }
.dkd--c-obra .dkd-lh__doc { grid-auto-flow: column; align-items: end; gap: 18px; }
.dkd--c-obra .dkd-lh__doc > .dkd-label { display: none; }
.dkd--c-obra .dkd-lh__number { font-size: var(--dk-fs-h1); font-weight: 700; order: 2; }
.dkd--c-obra .dkd-lh__dates { margin-top: 0; }
.dkd--c-obra .dkd-doctitle__text { font-size: var(--dk-fs-h2); }
.dkd--c-obra .dkd-cs--strip { padding: 7px 0 0; }
.dkd--c-obra .dkd-cs__value { font-size: var(--dk-fs-small); font-weight: 500; }
.dkd--c-obra .dkd-sh { border-bottom-width: 1.5px; padding-bottom: 3px; }
.dkd--c-obra .dkd-sh__title { font-size: var(--dk-fs-h3); font-weight: 700; letter-spacing: 0; }
.dkd--c-obra .dkd-block:is(.dkd-sec--items, .dkd-sec--totals, .dkd-sec--payment):has(> .dkd-sh) { display: none; }
.dkd--c-obra .dkd-sec--totals { padding-top: 12px; }
.dkd--c-obra .dkd-tbl { column-gap: 10px; }
.dkd--c-obra .dkd-tbl--head { background: var(--dk-ink); padding: 4px 6px; border: 0; }
.dkd--c-obra .dkd-tbl--head .dkd-label { color: var(--dk-paper); font-weight: 600; }
.dkd--c-obra .dkd-tbl--row { padding: 3px 6px; align-items: center; border-bottom: .5px solid var(--dk-rule-strong); }
.dkd--c-obra .dkd-tbl__ref { font-weight: 700; font-size: var(--dk-fs-body); }
.dkd--c-obra .dkd-tbl__meta { line-height: 1.28; }
.dkd--c-obra .dkd-tbl--row .dkd-dim, .dkd--c-obra .dkd-tbl--row .dkd-num { font-size: var(--dk-fs-small); }
.dkd--c-obra .dkd-term__title { display: inline; margin-right: 6px; }
.dkd--c-obra .dkd-term__body, .dkd--c-obra .dkd-term__body .dkd-rich, .dkd--c-obra .dkd-term__body p { display: inline; }
.dkd--c-obra .dkd-totwrap { grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; }
.dkd--c-obra .dkd-tot__row { padding: 1.5px 0; }
.dkd--c-obra .dkd-tot__grand { border-top-width: 3px; margin-top: 4px; padding-top: 6px; }
.dkd--c-obra .dkd-tot__grand dt { font-weight: 700; }
.dkd--c-obra .dkd-tot__grand dd { font-weight: 700; color: var(--dk-accent-ink); }
.dkd--c-obra .dkd-pay { grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; font-size: var(--dk-fs-small); align-items: start; }
.dkd--c-obra .dkd-pay__plan { max-width: none; grid-column: 2; grid-row: 1; }
.dkd--c-obra .dkd-pay .dkd-rich { grid-column: 1; grid-row: 1; }
.dkd--c-obra .dkd-pay__plan li { grid-template-columns: 36px minmax(0, 1fr) auto; }
.dkd--c-obra .dkd-acc--qr { grid-template-columns: minmax(0, 1fr) 262px; gap: 18px; }
.dkd--c-obra .dkd-acc__main { gap: 6px; }
.dkd--c-obra .dkd-acc__by { display: none; }
.dkd--c-obra .dkd-acc__statement { font-size: var(--dk-fs-small); }
.dkd--c-obra .dkd-acc__online { grid-template-columns: auto minmax(0, 1fr); gap: 8px; }
`

/**
 * Hogar: serif de libro para los títulos y sans humanista para los datos, márgenes anchos, sin líneas.
 * Empieza con una carta y explica en voz alta; las ventanas van por recinto, con el dibujo sobre papel.
 */
const HOGAR_CSS = /* css */ `
.dkd--c-hogar .dkd-page__head { height: 24px; margin-bottom: 26px; }
.dkd--c-hogar .dkd-sh__title { font-weight: 500; letter-spacing: -.01em; }
.dkd--c-hogar .dkd-sec--terms .dkd-sh__title, .dkd--c-hogar .dkd-sec--warranty .dkd-sh__title, .dkd--c-hogar .dkd-sec--payment .dkd-sh__title, .dkd--c-hogar .dkd-sec--acceptance .dkd-sh__title { font-size: var(--dk-fs-h3); }
.dkd--c-hogar .dkd-lh { padding-bottom: 12px; }
.dkd--c-hogar .dkd-lh__number { font-family: var(--dk-font-body); font-size: var(--dk-fs-body); font-weight: 600; letter-spacing: 0; }
.dkd--c-hogar .dkd-doctitle__text { font-size: var(--dk-fs-h1); font-weight: 500; line-height: 1.14; letter-spacing: -.014em; max-width: 92%; }
.dkd--c-hogar .dkd-letter, .dkd--c-hogar .dkd-letter--note { max-width: 560px; }
.dkd--c-hogar .dkd-letter__greet { font-weight: 600; }
.dkd--c-hogar .dkd-sec--items .dkd-sh__title { font-size: var(--dk-fs-body); font-family: var(--dk-font-body); font-weight: 600; letter-spacing: 0; }
.dkd--c-hogar .dkd-group { padding: 6px 0 12px; }
.dkd--c-hogar .dkd-group__name { font-size: var(--dk-fs-h2); font-weight: 500; letter-spacing: -.01em; }
.dkd--c-hogar .dkd-ihead__title { font-weight: 500; letter-spacing: -.004em; }
.dkd--c-hogar .dkd-ihead__ref { font-family: var(--dk-font-body); font-size: var(--dk-fs-small); }
.dkd--c-hogar .dkd-specs--c1 .dkd-spec { grid-template-columns: 92px minmax(0, 1fr); }
.dkd--c-hogar .dkd-card__body { gap: 10px; }
.dkd--c-hogar .dkd-card__top { min-height: 44px; }
.dkd--c-hogar .dkd-decision__figure { font-weight: 500; color: var(--dk-accent-ink); }
.dkd--c-hogar .dkd-decision__main .dkd-label:first-child { font-family: var(--dk-font-heading); font-size: var(--dk-fs-h3); color: var(--dk-ink); }
.dkd--c-hogar .dkd-scope { padding-top: 6px; }
.dkd--c-hogar .dkd-checks { gap: 5px; }
.dkd--c-hogar .dkd-paytl__pct { font-weight: 500; }
`

/**
 * Memoria: hoja horizontal con el dibujo como documento. Grotesca de carretera, datos en columna a la
 * derecha y una sola regla fuerte por ficha. El rojo queda para el número de capítulo.
 */
const MEMORIA_CSS = /* css */ `
.dkd--c-memoria .dkd-page__head { height: 18px; margin-bottom: 10px; }
.dkd--c-memoria .dkd-run { padding-bottom: 3px; border-bottom: .75px solid var(--dk-rule); }
.dkd--c-memoria .dkd-lh { padding-bottom: 10px; border-bottom: 2px solid var(--dk-ink); align-items: end; }
.dkd--c-memoria .dkd-lh__brand { grid-template-columns: auto minmax(0, 1fr); gap: 16px; align-items: end; }
.dkd--c-memoria .dkd-lh__number { font-size: var(--dk-fs-h1); font-weight: 600; }
.dkd--c-memoria .dkd-doctitle__text { font-size: var(--dk-fs-h2); }
.dkd--c-memoria .dkd-cs--grid { grid-template-columns: 2fr 2fr 2fr 1fr !important; padding-bottom: 2px; }
.dkd--c-memoria .dkd-sh { border-bottom: 0; border-top: 2px solid var(--dk-ink); padding: 5px 0 0; }
.dkd--c-memoria .dkd-sh__kicker { color: var(--dk-accent-ink); min-width: 16px; font-weight: 600; }
.dkd--c-memoria .dkd-sh__title { font-weight: 600; letter-spacing: 0; }
.dkd--c-memoria .dkd-index { grid-template-columns: 36px 52px minmax(0, 1fr) 110px 40px; padding: 2px 0; align-items: center; }
.dkd--c-memoria .dkd-index__name { grid-template-columns: minmax(0, 1fr) 170px; }
.dkd--c-memoria .dkd-index__thumb { display: flex; align-items: center; height: 28px; }
.dkd--c-memoria .dkd-totwrap { grid-template-columns: minmax(0, 1fr) 380px; gap: 56px; }
.dkd--c-memoria .dkd-acc__main { grid-template-columns: minmax(0, 1fr) 210px; column-gap: 20px; }
.dkd--c-memoria .dkd-acc__statement, .dkd--c-memoria .dkd-acc__by { grid-column: 1 / -1; }
.dkd--c-memoria .dkd-sign--company { max-width: none; grid-column: 2; grid-row: 2; }
.dkd--c-memoria .dkd-specs--c1 .dkd-spec { grid-template-columns: 74px minmax(0, 1fr); gap: 6px; }
.dkd--c-memoria .dkd-fiche--narrow .dkd-specs--c1 .dkd-spec { grid-template-columns: minmax(0, 1fr); gap: 0; }
.dkd--c-memoria .dkd-terms--cols { column-count: 3; column-gap: 24px; }
.dkd--c-memoria .dkd-acc--qr { grid-template-columns: minmax(0, 1fr) 300px; }
.dkd--c-memoria .dkd-acc__online { grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; }
`

const SHARED_TAIL = /* css */ `
/* ── Edición en pantalla ────────────────────────────────────────────────── */
.dkd .fzd-editable--on:hover { box-shadow: 0 0 0 1px var(--dk-accent-line); background: var(--dk-accent-soft); }
.dkd .fzd-editable--on:focus { box-shadow: 0 0 0 2px var(--dk-paper), 0 0 0 4px var(--dk-accent); background: var(--dk-paper); }
.dkd .fzd-editable--on:empty::before { color: var(--dk-faint); }

@media screen { .dkd-block--overflow { outline: 1px dashed #C23B48; outline-offset: 2px; } }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .dkd { display: block; gap: 0; }
  .dkd-page { box-shadow: none; margin: 0; height: calc(var(--dk-page-h) - 1px); break-after: page; page-break-after: always; }
  .dkd-page:last-child { break-after: auto; page-break-after: auto; }
  .dkd .fzd-editable--on { box-shadow: none !important; background: transparent !important; }
}
/* Alto de la cabecera y del pie (igual al que reserva la paginación). */
.dkd-page__head { height: ${CHROME.headerHeight}px; margin-bottom: ${CHROME.headerGap}px; }
.dkd-page__foot { height: ${CHROME.footerHeight}px; margin-top: ${CHROME.footerGap}px; }
`

export const TEMPLATE_CSS = [BASE_CSS, SHARED_TAIL, ATELIER_CSS, CORPORATIVA_CSS, OBRA_CSS, HOGAR_CSS, MEMORIA_CSS].join('\n')
