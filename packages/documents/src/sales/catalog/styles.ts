/**
 * Estilos del catálogo («.dkc»). Todo en unidades físicas (mm y pt) para que la pantalla y el PDF
 * coincidan; colores, fuentes y escala salen de las variables del tema (`catalogThemeVars`). Nada de
 * este CSS viene de la plantilla: la plantilla solo elige tokens acotados.
 */
import type { DocPage } from '@dekopen/shared'

const CSS = `
.dkc {
  --c-glass: #DDEAEC;
  font-family: var(--f-body);
  color: var(--c-ink);
  font-size: var(--t-base);
  line-height: var(--lh);
  font-variant-numeric: tabular-nums;
  font-kerning: normal;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  text-rendering: geometricPrecision;
}
.dkc *, .dkc *::before, .dkc *::after { box-sizing: border-box; }
.dkc svg text { font-family: var(--f-body) !important; }
:where(.dkc) :where(h1, h2, h3, h4, p, figure, dl, dd, ul, ol) { margin: 0; padding: 0; }
:where(.dkc) :where(ul, ol) { list-style: none; }
:where(.dkc) :where(svg, img) { display: block; }
:where(.dkc) :where(img) { max-width: 100%; }
.dkc .fzd-drawing, .dkc svg[role="img"] { overflow: visible; }

/* Páginas: hojas físicas exactas. */
.dkc-page {
  position: relative;
  width: var(--page-w);
  height: var(--page-h);
  margin: 0 auto 8mm;
  background: var(--c-paper);
  overflow: hidden;
  break-after: page;
  page-break-after: always;
  box-shadow: 0 1px 2px rgb(16 22 24 / 0.08), 0 10px 30px rgb(16 22 24 / 0.08);
}
.dkc-page:last-child { break-after: auto; page-break-after: auto; }
.dkc-page__inner { position: absolute; display: flex; flex-direction: column; }
.dkc-page__content { position: relative; overflow: hidden; }
.dkc-block { position: relative; overflow: hidden; }

/* Cromo de página */
.dkc-header {
  height: var(--header-h);
  margin-bottom: var(--header-gap);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6mm;
  border-bottom: var(--c-rule-w) solid var(--c-rule);
  font-size: var(--t-small);
  color: var(--c-muted);
  white-space: nowrap;
}
.dkc-header__brand { display: inline-flex; align-items: center; gap: 2.4mm; color: var(--c-ink); font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dkc-header__brand .dkc-logo { max-height: 5.4mm; max-width: 30mm; }
.dkc-header__brand .dkc-monogram { font-size: 8.5pt; }
.dkc-header__title { color: var(--c-ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.dkc-header__context { overflow: hidden; text-overflow: ellipsis; text-transform: var(--label-case); letter-spacing: var(--label-tracking); font-size: var(--t-micro); }
.dkc-footer {
  position: absolute;
  height: var(--footer-h);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  gap: 4mm;
  font-size: var(--t-micro);
  color: var(--c-muted);
  white-space: nowrap;
}
.dkc-footer__slot { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dkc-footer__slot--center { text-align: center; }
.dkc-footer__slot--right { text-align: right; }
.dkc-footer__num { font-variant-numeric: tabular-nums; }
.dkc-page--cover .dkc-footer { color: inherit; }

/* Tipografía común */
.dkc-kicker, .dkc-label {
  font-size: var(--t-micro);
  font-weight: 600;
  text-transform: var(--label-case);
  letter-spacing: var(--label-tracking);
  color: var(--c-kicker);
  line-height: 1.3;
}
.dkc-label { color: var(--c-muted); margin-bottom: 1.4mm; }
.dkc-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.dkc-code { font-family: var(--f-mono); font-size: var(--t-micro); letter-spacing: 0.02em; color: var(--c-muted); white-space: nowrap; }
.dkc-note { font-size: var(--t-small); color: var(--c-muted); line-height: 1.4; max-width: 170mm; }
.dkc-center { text-align: center; }
.dkc-subhead { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h3); color: var(--c-ink); margin-bottom: 3mm; letter-spacing: var(--tracking-heading); }
.dkc-caption { display: flex; justify-content: space-between; gap: 3mm; font-size: var(--t-micro); color: var(--c-muted); margin-top: 1.6mm; }
.dkc-tag { display: inline-block; margin-left: 2mm; padding: 0.3mm 1.6mm; border-radius: 999px; background: var(--c-accent-soft); color: var(--c-ink); font-size: var(--t-micro); font-weight: 600; vertical-align: 0.2mm; white-space: nowrap; }
.dkc-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 6.4mm; height: 6.4mm; padding: 0 1.4mm;
  border: 0.3mm solid var(--c-accent); border-radius: var(--r-sm);
  color: var(--c-accent); font-family: var(--f-heading); font-weight: 700; font-size: 8.5pt; line-height: 1;
  flex: none;
}
.dkc-badge--solid { background: var(--c-band); border-color: var(--c-band); color: var(--c-on-band); }

/* Título de sección */
.dkc-heading { padding-top: 0.5mm; }
.dkc-heading .dkc-kicker { margin-bottom: 1.6mm; }
.dkc-heading__title {
  font-family: var(--f-heading);
  font-weight: var(--w-heading);
  font-size: var(--t-h2);
  line-height: 1.12;
  letter-spacing: var(--tracking-heading);
  color: var(--c-heading);
}
.dkc-heading__lead { margin-top: 2mm; color: var(--c-muted); max-width: 150mm; }

/* Tonos de sección (remapean variables) */
.dkc-tone--surface { background: var(--c-surface); border-radius: var(--r); padding: 0 calc(var(--u) * 0.8); }
.dkc-tone--strong { background: var(--c-strong); color: var(--c-on-strong); --c-ink: var(--c-on-strong); --c-muted: var(--c-on-strong-muted); --c-heading: var(--c-on-strong); --c-kicker: var(--c-on-strong-muted); --c-rule: var(--c-on-strong-muted); --c-surface: rgb(255 255 255 / 0.06); --c-well: rgb(255 255 255 / 0.06); }
.dkc-tone--accent { background: var(--c-accent); color: var(--c-on-accent); --c-ink: var(--c-on-accent); --c-muted: var(--c-on-accent); --c-heading: var(--c-on-accent); --c-kicker: var(--c-on-accent); --c-rule: var(--c-on-accent); --c-surface: rgb(255 255 255 / 0.1); --c-well: rgb(255 255 255 / 0.1); }
.dkc-block.dkc-tone--strong, .dkc-block.dkc-tone--accent { padding: 0 calc(var(--u) * 0.8); border-radius: var(--r); }

/* Marca */
.dkc-logo { max-height: 11mm; max-width: 42mm; object-fit: contain; }
.dkc-monogram { font-family: var(--f-heading); font-weight: 600; font-size: 11pt; line-height: 1.15; letter-spacing: -0.01em; color: var(--c-ink); white-space: nowrap; }

/* Muestras */
.dkc-swatch { width: 100%; height: 100%; border-radius: var(--r-sm); }
.dkc-chips { display: flex; flex-wrap: wrap; gap: 1.6mm; align-items: center; }
.dkc-chip { display: inline-flex; align-items: center; gap: 1.4mm; font-size: var(--t-small); }
.dkc-chip__sw { width: 6mm; height: 6mm; flex: none; }
.dkc-chips--names { gap: 1.6mm 3.4mm; }
.dkc-chip--more { font-size: var(--t-micro); color: var(--c-muted); }

/* Glifos y precio */
.dkc-glyph { color: var(--c-ink); flex: none; }
.dkc-price { font-size: var(--t-small); white-space: nowrap; }
.dkc-price__from { color: var(--c-muted); }
.dkc-price__value { font-weight: 650; color: var(--c-ink); font-variant-numeric: tabular-nums; }
.dkc-price__unit { color: var(--c-muted); }
.dkc-price--ask { color: var(--c-muted); font-style: italic; }
.dkc-qr { display: flex; flex-direction: column; align-items: center; gap: 1.2mm; flex: none; }
.dkc-qr figcaption { font-size: var(--t-micro); color: var(--c-muted); text-align: center; max-width: 34mm; line-height: 1.25; }

/* Listas de datos */
.dkc-facts { display: grid; gap: 0; }
.dkc-facts__row { display: flex; justify-content: space-between; gap: 4mm; padding: 1.6mm 0; border-bottom: 0.2mm solid var(--c-rule-soft); font-size: var(--t-small); }
.dkc-facts__row dt { color: var(--c-muted); }
.dkc-facts__row dd { color: var(--c-ink); font-weight: 600; text-align: right; }
.dkc-facts--rules .dkc-facts__row { border-bottom: var(--c-rule-w) solid var(--c-rule); }
.dkc-icons { display: flex; flex-wrap: wrap; gap: 1.6mm; color: var(--c-ink); }
.dkc-icons__item { display: flex; flex-direction: column; align-items: center; gap: 0.6mm; }
.dkc-icons--labels .dkc-icons__item { width: 18mm; }
.dkc-icons__label { font-size: var(--t-micro); color: var(--c-muted); text-align: center; line-height: 1.2; }
.dkc-icons__more { align-self: center; font-size: var(--t-micro); color: var(--c-muted); }

/* Índice */
.dkc-toc { display: grid; gap: 0; }
.dkc-toc__row { display: flex; align-items: baseline; gap: 2.4mm; padding: 2.1mm 0; font-size: calc(var(--t-base) * 1.1); }
.dkc-tocfam { display: grid; height: 100%; }
.dkc-tocfam__item { display: flex; gap: var(--u); min-width: 0; min-height: 0; margin: 0; }
.dkc-tocfam__well { flex: none; min-height: 0; display: flex; align-items: center; justify-content: center; background: var(--c-surface); border-radius: var(--r); }
.dkc-tocfam figcaption { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 0.6mm; }
.dkc-tocfam__name { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h3); letter-spacing: var(--tracking-heading); color: var(--c-heading); }
.dkc-tocfam__desc { font-size: var(--t-small); color: var(--c-muted); line-height: 1.4; }
.dkc-toc__row--sub { padding-left: 6mm; font-size: var(--t-base); color: var(--c-muted); }
.dkc-toc__label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120mm; }
.dkc-toc__dots { flex: 1 1 auto; border-bottom: 0.25mm dotted var(--c-rule-soft); transform: translateY(-1mm); min-width: 6mm; }
.dkc-toc__page { font-variant-numeric: tabular-nums; color: var(--c-ink); font-weight: 600; min-width: 6mm; text-align: right; }

/* Guía */
.dkc-steps { display: grid; grid-template-columns: 1fr 1fr; gap: var(--u); }
.dkc-openings { padding-top: 1mm; }
.dkc-step { background: var(--c-surface); border-radius: var(--r); padding: 4mm 4.4mm; min-height: 0; }
.dkc-step__n { display: block; font-family: var(--f-heading); font-size: var(--t-h2); line-height: 1; color: var(--c-accent); font-weight: var(--w-heading); margin-bottom: 2mm; }
.dkc-step__title { font-family: var(--f-heading); font-size: var(--t-h3); font-weight: var(--w-heading); margin-bottom: 1mm; letter-spacing: var(--tracking-heading); }
.dkc-step__text { font-size: var(--t-small); color: var(--c-muted); line-height: 1.4; }
.dkc-openings__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm var(--u); }
.dkc-opening { display: flex; gap: 2.6mm; align-items: flex-start; }
.dkc-opening__name { font-weight: 600; font-size: var(--t-small); }
.dkc-opening__hint { font-size: var(--t-micro); color: var(--c-muted); line-height: 1.3; }

/* Texto libre */
.dkc-rich { max-width: 160mm; }
.dkc-rich--cols { max-width: none; column-count: 2; column-gap: var(--u); }
.dkc-rich--callout { background: var(--c-accent-soft); padding: 3mm 4mm; border-radius: var(--r); }
.dkc-rich__p { white-space: pre-wrap; }
.dkc-rich__h2 { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: calc(var(--t-h3) * 1.2); line-height: 1.2; letter-spacing: var(--tracking-heading); color: var(--c-heading); }
.dkc-rich__h3 { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h3); line-height: 1.2; }
.dkc-rich__list { padding-left: 5mm !important; list-style: disc !important; }
.dkc ol.dkc-rich__list { list-style: decimal !important; }
.dkc-rich__list li + li { margin-top: 1mm; }

/* Línea a página completa (Habitar) */
.dkc-life { height: 100%; display: flex; flex-direction: column; }
.dkc-life__stage {
  position: relative; display: flex; align-items: center; justify-content: center;
  background: var(--c-surface); border-radius: var(--r);
}
.dkc-life__caption { position: absolute; left: calc(var(--u) * 1.2); bottom: calc(var(--u) * 0.9); font-size: var(--t-micro); color: var(--c-muted); }
.dkc-life__body { flex: 1 1 auto; display: grid; grid-template-columns: 1.25fr 1fr; gap: calc(var(--u) * 2); padding-top: calc(var(--u) * 1.6); min-height: 0; }
.dkc-life__name { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h1); line-height: 1.04; letter-spacing: var(--tracking-heading); color: var(--c-heading); margin: 1.6mm 0 3mm; }
.dkc-life__desc { color: var(--c-muted); font-size: calc(var(--t-base) * 1.06); margin-bottom: 4mm; max-width: 100mm; }
.dkc-life__colors { margin-top: 4mm; }
.dkc-life__designs { padding-top: calc(var(--u) * 1.2); border-top: 0.2mm solid var(--c-rule-soft); }
.dkc-life__designs .dkc-icons { gap: 2mm 3mm; }

/* Ficha técnica (Sistema) */
.dkc-sheet { height: 100%; display: flex; flex-direction: column; }
.dkc-sheet__band { display: flex; align-items: center; gap: 4mm; background: var(--c-band); color: var(--c-on-band); padding: 3mm 4mm; border-radius: var(--r); }
.dkc-sheet__code { font-family: var(--f-mono); font-size: 18pt; font-weight: 600; line-height: 1; padding-right: 4mm; border-right: 0.3mm solid currentColor; }
.dkc-sheet__title h2 { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h2); line-height: 1.05; letter-spacing: var(--tracking-heading); }
.dkc-sheet__title span { font-size: var(--t-small); opacity: 0.85; }
.dkc-sheet__grid { flex: 1 1 auto; display: flex; gap: calc(var(--u) * 1.5); padding-top: calc(var(--u) * 1.4); min-height: 0; }
.dkc-sheet__desc { font-size: var(--t-small); color: var(--c-muted); margin-bottom: 3mm; }
.dkc-sheet__group { margin-top: 4mm; }
.dkc-sheet__openings { display: grid; gap: 1.4mm; }
.dkc-sheet__openings li { display: flex; align-items: center; gap: 2.4mm; font-size: var(--t-small); }
.dkc-sheet__figure { display: flex; flex-direction: column; }
.dkc-sheet__drawing { display: flex; align-items: center; justify-content: center; border: var(--c-rule-w) solid var(--c-rule); border-radius: var(--r); background: var(--c-paper); }
.dkc-sheet__products-label { margin-top: 4mm; }
.dkc-sheet__products { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2mm 4mm; }
.dkc-sheet__products li { display: flex; align-items: center; gap: 2mm; font-size: var(--t-small); border-bottom: 0.2mm solid var(--c-rule-soft); padding: 0.6mm 0; }
.dkc-sheet__pname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dkc-sheet__note { margin-top: auto; padding-top: 3mm; }

/* Mapa de líneas (Colección Modular) */
.dkc-tiles { display: flex; gap: var(--u); height: 100%; }
.dkc-tile { display: flex; flex-direction: column; gap: 2.2mm; border: 0.2mm solid var(--c-rule); border-radius: var(--r); padding: 3.2mm; height: calc(100% - var(--u)); }
.dkc-tile__head { display: flex; align-items: center; gap: 2.6mm; }
.dkc-tile__title { flex: 1 1 auto; min-width: 0; }
.dkc-tile__title h3 { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h3); line-height: 1.15; letter-spacing: var(--tracking-heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dkc-tile__title span { font-size: var(--t-micro); color: var(--c-muted); }
.dkc-tile__count { font-size: var(--t-micro); color: var(--c-muted); white-space: nowrap; }
.dkc-tile__well { height: 44mm; display: flex; align-items: center; justify-content: center; background: var(--c-well); border-radius: var(--r-sm); }
.dkc-tile__meta { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; font-size: var(--t-small); color: var(--c-muted); }

/* Capítulo de productos */
.dkc-chapter { display: flex; align-items: center; gap: 3mm; padding: 2mm 0 2.4mm; border-bottom: var(--c-rule-w) solid var(--c-rule); margin-bottom: 1mm; }
.dkc-chapter__title { flex: 1 1 auto; min-width: 0; }
.dkc-chapter__title h3 { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h3); line-height: 1.2; letter-spacing: var(--tracking-heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dkc-chapter__title span { font-size: var(--t-micro); color: var(--c-muted); }
.dkc-chapter .dkc-qr figcaption { display: none; }

/* Tarjetas */
.dkc-cards { display: flex; align-items: flex-start; }
.dkc-card { display: flex; flex-direction: column; border: 0.2mm solid var(--c-rule); border-radius: var(--r); overflow: hidden; background: var(--c-paper); }
.dkc-card__well { position: relative; display: flex; align-items: center; justify-content: center; background: var(--c-well); flex: none; }
.dkc-card__code { position: absolute; left: 2mm; top: 1.6mm; }
.dkc-card__body { display: flex; flex-direction: column; gap: 0.7mm; min-height: 0; flex: 1 1 auto; }
.dkc-card__name { font-family: var(--f-heading); font-weight: var(--w-strong); font-size: var(--t-h3); line-height: 1.15; letter-spacing: var(--tracking-heading); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dkc-card__line { font-size: var(--t-small); color: var(--c-muted); line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dkc-card__price { margin-top: 0.8mm; }

/* Filas de producto (Sistema) */
.dkc-prow { display: grid; grid-template-columns: auto 12mm 1fr auto auto; align-items: center; gap: 4mm; height: 100%; border-bottom: 0.2mm solid var(--c-rule-soft); }
.dkc-prow__drawing { display: flex; align-items: center; justify-content: center; }
.dkc-prow__name { font-weight: 600; }
.dkc-prow__sub { font-size: var(--t-small); color: var(--c-muted); }
.dkc-prow__size { font-size: var(--t-small); color: var(--c-muted); font-family: var(--f-mono); }

/* Lookbook */
.dkc-look { display: flex; }
.dkc-look__item { display: flex; gap: calc(var(--u) * 1.6); align-items: stretch; }
.dkc-look__item--flip { flex-direction: row-reverse; }
.dkc-look--cols .dkc-look__item { flex-direction: column; gap: 2.6mm; }
.dkc-look__stage { display: flex; align-items: center; justify-content: center; background: var(--c-surface); border-radius: var(--r); flex: none; }
.dkc-look__text { display: flex; flex-direction: column; justify-content: center; gap: 1.6mm; min-width: 0; }
.dkc-look--cols .dkc-look__text { justify-content: flex-start; }
.dkc-look__name { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h2); line-height: 1.08; letter-spacing: var(--tracking-heading); color: var(--c-heading); }
.dkc-look--cols .dkc-look__name { font-size: calc(var(--t-h3) * 1.2); }
.dkc-look__line { font-size: var(--t-small); color: var(--c-muted); }
.dkc-look__caption { font-size: var(--t-micro); color: var(--c-muted); font-style: italic; }

/* Matriz */
.dkc-matrix { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: var(--t-small); }
.dkc-matrix th, .dkc-matrix td { text-align: left; vertical-align: top; padding: 2mm 2.4mm 2mm 0; border-bottom: 0.2mm solid var(--c-rule-soft); }
.dkc-matrix thead th { border-bottom: var(--c-rule-w) solid var(--c-rule); padding-bottom: 2.4mm; vertical-align: bottom; }
.dkc-matrix thead th .dkc-badge { margin-bottom: 1.4mm; }
.dkc-matrix__corner { width: 30mm; color: var(--c-muted); font-weight: 500; font-size: var(--t-micro); text-transform: var(--label-case); letter-spacing: var(--label-tracking); }
.dkc-matrix__name { display: block; font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h3); line-height: 1.15; letter-spacing: var(--tracking-heading); color: var(--c-ink); }
.dkc-matrix__brand { display: block; font-weight: 400; font-size: var(--t-micro); color: var(--c-muted); }
.dkc-matrix tbody th { font-weight: 600; color: var(--c-muted); font-size: var(--t-micro); text-transform: var(--label-case); letter-spacing: var(--label-tracking); }
.dkc-matrix__openings li { line-height: 1.35; }
.dkc-matrix--zebra tbody tr:nth-child(odd) td, .dkc-matrix--zebra tbody tr:nth-child(odd) th { background: var(--c-surface); }
.dkc-matrix--zebra tbody th { padding-left: 2mm; }
.dkc-matrix .dkc-chip__sw { width: 4.4mm; height: 4.4mm; }

/* Terminaciones */
.dkc-swatches { display: flex; align-items: flex-start; }
.dkc-sw { display: flex; flex-direction: column; gap: 1.6mm; }
.dkc-sw figcaption { display: flex; flex-direction: column; gap: 0.2mm; }
.dkc-sw__name { font-weight: 600; font-size: var(--t-small); line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dkc-sw__meta { font-size: var(--t-micro); color: var(--c-muted); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dkc-swatches--boards .dkc-sw__name { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h3); letter-spacing: var(--tracking-heading); }
.dkc-pairs { display: flex; }
.dkc-pair { display: flex; flex-direction: column; gap: 2mm; }
.dkc-pair__tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2mm; }
.dkc-pair__tile { position: relative; height: 100%; min-height: 0; }
.dkc-pair__tile .dkc-swatch { position: absolute; inset: 0; }
.dkc-pair__side { position: absolute; left: 2mm; bottom: 1.6mm; padding: 0.3mm 1.4mm; background: rgb(255 255 255 / 0.88); color: #1D2426; font-size: var(--t-micro); font-weight: 600; }
.dkc-pair figcaption { display: flex; flex-direction: column; }
.dkc-pair .dkc-sw__name { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h3); }

/* Vidrios */
.dkc-glass { display: grid; }
.dkc-glass__row { display: grid; grid-template-columns: 7mm 1fr auto; gap: 3mm; align-items: center; padding: 1.8mm 0; border-bottom: 0.2mm solid var(--c-rule-soft); }
.dkc-layers-glyph { width: 6.5mm; height: 6.5mm; color: var(--c-accent); }
.dkc-glass__name { font-weight: 600; }
.dkc-glass__sub { font-size: var(--t-small); color: var(--c-muted); }
.dkc-glass__mm { font-size: var(--t-small); color: var(--c-muted); }
.dkc-glasscards { display: flex; flex-wrap: wrap; align-content: flex-start; }
.dkc-glasscard { display: flex; gap: 4mm; align-items: center; border: 0.2mm solid var(--c-rule); border-radius: var(--r); padding: 3mm; height: 36mm; }
.dkc-glasscard__section { width: 44mm; height: 29mm; color: var(--c-ink); flex: none; }
.dkc-glasscard__text { min-width: 0; display: flex; flex-direction: column; gap: 0.8mm; }
.dkc-glasscards__note { width: 100%; }

/* Herrajes */
.dkc-hw { display: flex; flex-wrap: wrap; }
.dkc-hw__item { display: flex; gap: 2.6mm; align-items: flex-start; border: 0.2mm solid var(--c-rule-soft); border-radius: var(--r); padding: 2.6mm; }
.dkc-hw--list .dkc-hw__item { border: 0; border-bottom: 0.2mm solid var(--c-rule-soft); border-radius: 0; padding: 1.6mm 0; }
.dkc-hw-glyph { width: 6.5mm; height: 6.5mm; color: var(--c-muted); flex: none; }
.dkc-hw__main { min-width: 0; }
.dkc-hw__name { font-weight: 600; font-size: var(--t-small); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dkc-hw__sub { font-size: var(--t-micro); color: var(--c-muted); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Contacto */
.dkc-contact { display: flex; gap: calc(var(--u) * 2); align-items: center; border-radius: var(--r); }
.dkc-contact--card { background: var(--c-surface); padding: calc(var(--u) * 1.4); }
.dkc-contact--large { flex-direction: column; align-items: flex-start; justify-content: space-between; padding: calc(var(--u) * 2.2); }
.dkc-contact--large .dkc-contact__main { flex: none; width: 100%; gap: 7mm; }
.dkc-contact--large .dkc-contact__lead { font-size: var(--t-h3); line-height: 1.35; max-width: 130mm; color: var(--c-ink); }
.dkc-contact--large .dkc-contact__rows { gap: 5mm 8mm; }
.dkc-contact--large .dkc-contact__rows dd { font-size: var(--t-h3); }
.dkc-contact--band { background: var(--c-band); color: var(--c-on-band); padding: calc(var(--u) * 1.1) calc(var(--u) * 1.4); --c-ink: var(--c-on-band); --c-muted: var(--c-on-band); }
.dkc-contact--band .dkc-contact__lead { display: none; }
.dkc-contact--band .dkc-monogram { color: var(--c-on-band); }
.dkc-contact--band .dkc-qr { background: #FFFFFF; padding: 1.4mm; border-radius: var(--r-sm); }
.dkc-contact--band .dkc-qr figcaption { display: none; }
.dkc-contact--qr { flex-direction: row-reverse; justify-content: flex-end; border: var(--c-rule-w) solid var(--c-rule); padding: calc(var(--u) * 1.3); }
.dkc-contact__main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2.6mm; }
.dkc-contact__brand { display: flex; align-items: center; gap: 3mm; }
.dkc-contact__org { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h3); line-height: 1.15; }
.dkc-contact__legal { font-size: var(--t-micro); color: var(--c-muted); }
.dkc-contact__lead { color: var(--c-muted); max-width: 110mm; }
.dkc-contact__rows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.6mm 6mm; }
.dkc-contact__rows dt { font-size: var(--t-micro); color: var(--c-muted); text-transform: var(--label-case); letter-spacing: var(--label-tracking); }
.dkc-contact__rows dd { font-weight: 600; overflow-wrap: anywhere; }

/* Imágenes */
.dkc-img { width: 100%; object-fit: cover; border-radius: var(--r); filter: var(--img-filter); }
.dkc-gallery { display: flex; align-items: flex-start; }

/* Portadas */
.dkc-cover { position: absolute; inset: 0; background: var(--c-paper); }
.dkc-cover.dkc-tone--strong { background: var(--c-strong); }
.dkc-cover.dkc-tone--accent { background: var(--c-accent); }
.dkc-cover__inner { display: flex; flex-direction: column; }
.dkc-cover__inner > * { flex: none; }
.dkc-cover__inner > .dkc-cover__spacer { flex: 1 1 auto; }
.dkc-cover__tile--wide { grid-column: 1 / -1; }
.dkc-cover__spacer { flex: 1 1 auto; }
.dkc-cover__brand { display: flex; align-items: center; gap: 3.2mm; }
.dkc-cover__org { font-family: var(--f-heading); font-weight: var(--w-strong); font-size: var(--t-h3); line-height: 1.15; }
.dkc-cover__contact { font-size: var(--t-small); color: var(--c-muted); margin-top: 0.6mm; }
.dkc-cover__contact--foot { margin-top: 4mm; }
.dkc-cover__titles .dkc-kicker { margin-bottom: 3mm; }
.dkc-cover__title { font-family: var(--f-heading); font-weight: var(--w-heading); letter-spacing: var(--tracking-heading); color: var(--c-heading); line-height: 1; max-width: 165mm; }
.dkc-cover__title--display { font-size: var(--t-display); }
.dkc-cover__title--h1 { font-size: var(--t-h1); line-height: 1.04; }
.dkc-cover__title--long.dkc-cover__title--display { font-size: calc(var(--t-display) * 0.78); }
.dkc-cover__title--long.dkc-cover__title--h1 { font-size: calc(var(--t-h1) * 0.85); }
.dkc-cover__lead { margin-top: 4mm; color: var(--c-muted); font-size: calc(var(--t-base) * 1.12); max-width: 120mm; line-height: 1.45; }
.dkc-cover__facts { display: flex; flex-wrap: wrap; gap: 3mm 9mm; margin-top: 7mm; padding-top: 4mm; border-top: var(--c-rule-w) solid var(--c-rule); }
.dkc-cover__facts li { display: flex; align-items: baseline; gap: 1.6mm; }
.dkc-cover__fact-value { font-family: var(--f-heading); font-weight: var(--w-heading); font-size: var(--t-h2); line-height: 1; color: var(--c-heading); font-variant-numeric: tabular-nums; }
.dkc-cover__fact-label { font-size: var(--t-small); color: var(--c-muted); }
.dkc-cover__band { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c-band); }
.dkc-cover__rule { height: 0; border-top: var(--c-rule-w) solid var(--c-ink); margin: 7mm 0 5mm; }
.dkc-cover__key { color: var(--c-ink); }
.dkc-lineup { display: flex; align-items: flex-end; justify-content: center; }
.dkc-lineup__item { flex: none; display: flex; align-items: flex-end; }
.dkc-cover__stage { position: relative; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; background: var(--c-surface); border-radius: var(--r); margin-top: 7mm; padding: 8mm 8mm 9mm; }
.dkc-cover__inner > .dkc-cover__stage--grow { flex: 1 1 auto; margin-bottom: 7mm; }
.dkc-cover__ground { position: absolute; left: 6mm; right: 6mm; bottom: 8.6mm; height: 0; border-top: 0.35mm solid var(--c-rule); }
.dkc-cover__top { margin-bottom: 9mm; }
.dkc-cover__index { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 8mm; margin-top: 6mm; }
.dkc-cover__index li { display: flex; align-items: center; gap: 2.4mm; font-size: var(--t-small); border-bottom: 0.2mm solid var(--c-rule-soft); padding-bottom: 1.6mm; }
.dkc-cover__index-name { flex: 1 1 auto; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dkc-cover__index-meta { color: var(--c-muted); font-size: var(--t-micro); white-space: nowrap; }
.dkc-cover__hero { position: absolute; left: 0; right: 0; top: 0; background: var(--c-surface); overflow: hidden; }
.dkc-cover__hero .dkc-cover__photo { width: 100%; height: 100%; border-radius: 0; }
.dkc-cover__wall { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 14mm; }
.dkc-cover__sill { width: 72%; height: 0; border-top: 0.5mm solid var(--c-rule); margin-top: 0; }
.dkc-cover__hero-brand { position: absolute; display: flex; align-items: center; gap: 3mm; }
.dkc-cover__mosaic { position: absolute; left: 0; top: 0; bottom: 0; display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 1fr; gap: 1.2mm; background: var(--c-paper); }
.dkc-cover__mosaic .dkc-cover__photo { grid-column: 1 / -1; grid-row: 1 / -1; height: 100%; border-radius: 0; }
.dkc-cover__tile { position: relative; }
.dkc-cover__tile .dkc-swatch { border-radius: 0; }
.dkc-cover__tile-name { position: absolute; left: 3mm; bottom: 2.6mm; padding: 0.4mm 1.6mm; background: rgb(255 255 255 / 0.9); color: #1D2426; font-size: var(--t-micro); font-weight: 600; }
.dkc-cover__mosaic-hero { grid-column: 1 / -1; grid-row: 1 / -1; display: flex; align-items: center; justify-content: center; background: var(--c-surface); }

@media print {
  .dkc-page { margin: 0; box-shadow: none; }
}
`

/** CSS completo del catálogo, con la regla @page del papel de la plantilla. */
export function catalogCss(page: Pick<DocPage, 'size'>): string {
  const size = page.size === 'A4' ? 'A4' : 'letter'
  return `@page { size: ${size}; margin: 0; }\n${CSS}`
}

export const CATALOG_CSS = CSS
