/** CSS de las plantillas de cotización y catálogo (todo bajo `.fzd`). */
export const SALES_CSS = /* css */ `
/* ── Piezas comunes de venta ─────────────────────────────────────────────── */
.fzd .fzd-strong { font-weight: 600; color: var(--fzd-ink); }
.fzd .fzd-inline { display: inline-flex; align-items: center; gap: 4px; }
.fzd .fzd-link { color: var(--fzd-accent-ink); font-weight: 500; }
.fzd .fzd-running { margin-bottom: 22px; }
.fzd-specline { display: flex; flex-wrap: wrap; gap: 1px 12px; font-size: 10.5px; color: var(--fzd-ink-2); line-height: 1.55; }
.fzd-specline__part { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }

.fzd-price { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.fzd-price--left { text-align: left; align-items: flex-start; }
.fzd-price__unit { font-size: 10.5px; color: var(--fzd-muted); font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
.fzd-price__total { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
.fzd-price__qty { font-size: 9.5px; color: var(--fzd-faint); }

.fzd-drawbox { position: relative; flex: none; }
.fzd-drawbox__main { height: 100%; display: flex; align-items: center; justify-content: center; }
.fzd-drawbox--inset { justify-content: flex-start; }
.fzd-drawbox__inset { position: absolute; right: 6px; bottom: 6px; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 4px 4px 2px; background: rgb(255 255 255 / .86); border-radius: 4px; box-shadow: 0 0 0 1px var(--fzd-rule); }
.fzd-drawbox__inset span { font-size: 7.5px; color: var(--fzd-muted); letter-spacing: .02em; }

.fzd-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--fzd-ink); }
.fzd-section-head__title { font-size: 13px; font-weight: 600; }

.fzd-paybox { min-width: 0; }
.fzd-paybox__plan { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--fzd-rule-strong); max-width: 300px; }

.fzd-accept { display: grid; gap: 10px; break-inside: avoid; margin-top: 14px; padding-top: 16px; border-top: 1px solid var(--fzd-rule); }
.fzd-accept__head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.fzd-accept__text { margin-top: -4px; }
.fzd-accept__by { margin-top: 2px; }
/* Aceptación en una columna (junto a los totales, en «Compacta»). */
.fzd-accept--inline { margin-top: 0; padding-top: 12px; gap: 8px; }
.fzd-accept--inline .fzd-accept__head { flex-direction: column; align-items: flex-start; gap: 2px; }
.fzd-accept--inline .fzd-sign { gap: 14px; }
.fzd-accept--inline .fzd-sign__space { height: 30px; }

.fzd-figures { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid var(--fzd-ink); }
.fzd-figure { padding: 10px 14px 0 0; }
.fzd-figure + .fzd-figure { padding-left: 14px; border-left: 1px solid var(--fzd-rule); }
.fzd-figure dt { font-size: 9.5px; color: var(--fzd-muted); }
.fzd-figure dd { margin-top: 3px; font-size: 14px; line-height: 1.3; font-weight: 500; font-variant-numeric: tabular-nums lining-nums; }
.fzd-figure--strong dd, .fzd-figure dd.fzd-num { white-space: nowrap; }
.fzd-figure--strong dd { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 20px; color: var(--fzd-accent-ink); }

/* ── Esencial ────────────────────────────────────────────────────────────── */
.fzd-es-opening { display: flex; flex-direction: column; }
.fzd-es-title { margin-top: 34px; max-width: 560px; }
.fzd-es-strip { margin-top: 18px; display: grid; grid-template-columns: 1.25fr 1fr auto; gap: 24px; padding: 14px 0; border-top: 1px solid var(--fzd-rule); border-bottom: 1px solid var(--fzd-rule); font-size: 11px; line-height: 1.5; }
.fzd-es-strip .fzd-label { margin-bottom: 3px; }
.fzd-es-strip__total { text-align: right; }
.fzd-es-strip--noclient { grid-template-columns: 1fr auto; }
.fzd-es-strip__amount { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 22px; line-height: 1.15; color: var(--fzd-accent-ink); font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
.fzd-es-intro { margin: 18px 0 26px; max-width: 600px; }
.fzd-es-row { display: grid; grid-template-columns: 236px minmax(0, 1fr) auto; gap: 22px; padding: 14px 0; border-bottom: 1px solid var(--fzd-rule); align-items: start; break-inside: avoid; }
.fzd-es-row__body { padding-top: 6px; min-width: 0; }
.fzd-es-row__title { display: flex; align-items: center; gap: 8px; }
.fzd-es-row__sub { margin-top: 3px; padding-left: 1px; }
.fzd-es-row__specs { margin-top: 14px; }
.fzd-es-row__note { margin-top: 10px; padding-left: 8px; border-left: 2px solid var(--fzd-accent-line); }
.fzd-es-row .fzd-price { padding-top: 8px; min-width: 120px; }
.fzd-es-row--dense { padding: 10px 0; }
.fzd-es-row--dense .fzd-es-row__specs { margin-top: 12px; }
.fzd-es-close { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 32px; align-items: start; padding-top: 22px; }
.fzd-es-close__left { display: grid; gap: 14px; min-width: 0; }
.fzd-es-terms { margin-top: 26px; padding-top: 16px; border-top: 1px solid var(--fzd-rule); }
/* Si las condiciones abren una hoja, la línea del encabezado ya las separa (sin doble raya). */
.fzd-running + .fzd-es-terms, .fzd-running + .fzd-accept { margin-top: 0; padding-top: 0; border-top: 0; }

/* ── Galería ─────────────────────────────────────────────────────────────── */
.fzd-ga-cover .fzd-page__body { gap: 0; }
.fzd-ga-cover__top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.fzd-ga-cover__head { margin-top: 64px; }
.fzd-ga-cover__title { margin-top: 8px; font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 46px; line-height: 1.04; max-width: 620px; }
.fzd-ga-cover__sub { margin-top: 10px; font-size: 16px; color: var(--fzd-ink-2); }
.fzd-ga-cover__stage { margin-top: 28px; margin-bottom: 28px; padding: 36px 32px 20px; background: var(--fzd-tint); border-radius: 12px; box-shadow: inset 0 -1px 0 var(--fzd-rule); }
.fzd-ga-cover__figures { margin-top: 0; }
.fzd-ga-cover__intro { margin-top: 26px; max-width: 580px; }
.fzd-elevation { display: flex; align-items: flex-end; justify-content: center; gap: 26px; }
.fzd-elevation__item { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.fzd-elevation__item figcaption { height: 18px; }
.fzd-ga-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-bottom: 14px; break-inside: avoid; }
.fzd-ga-card { border: 1px solid var(--fzd-rule); border-radius: 10px; overflow: hidden; background: var(--fzd-paper); display: flex; flex-direction: column; }
.fzd-ga-card__well { border-radius: 0; width: 100% !important; border-bottom: 1px solid var(--fzd-rule); }
.fzd-ga-card__body { padding: 10px 14px 10px; display: grid; gap: 3px; }
.fzd-ga-card__head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.fzd-ga-card__title { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.fzd-ga-card__total { font-size: 13.5px; font-weight: 600; }
.fzd-ga-card__specs { margin-top: 2px; }
.fzd-ga-card__foot { display: flex; justify-content: space-between; gap: 12px; margin-top: 4px; padding-top: 7px; border-top: 1px solid var(--fzd-rule); font-size: 10px; color: var(--fzd-muted); font-variant-numeric: tabular-nums lining-nums; }
.fzd-ga-card__note { margin-top: 2px; }
.fzd-ga-close { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 32px; align-items: start; padding: 18px 20px; margin-top: 6px; background: var(--fzd-tint); border-radius: 10px; }
.fzd-ga-close .fzd-totals { background: var(--fzd-paper); }
.fzd-ga-terms { margin-top: 24px; }

/* ── Compacta ────────────────────────────────────────────────────────────── */
.fzd-co-strip { margin-top: 18px; display: grid; grid-template-columns: 1.3fr 1.2fr 1.2fr auto; gap: 18px; padding: 10px 0; border-top: 1px solid var(--fzd-ink); border-bottom: 1px solid var(--fzd-rule); font-size: 11px; }
.fzd-co-strip dt { font-size: 9.5px; color: var(--fzd-muted); margin-bottom: 1px; }
.fzd-co-strip dd { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fzd-co-strip > div:last-child { text-align: right; }
.fzd-co-strip--3 { grid-template-columns: 1.5fr 1.3fr auto; }
.fzd-co-strip--2 { grid-template-columns: 1fr auto; }
.fzd-co-intro { margin: 12px 0 18px; font-size: 11.5px; max-width: 640px; }
.fzd-co-table { table-layout: fixed; margin-top: 4px; }
/* Fila de 44 px: nombre (1 línea) + detalle (hasta 2 líneas) caben justo; así 20 ventanas van en dos hojas. */
.fzd-co-table td { padding-top: 2px; padding-bottom: 2px; height: 44px; }
.fzd-co-table th { font-stretch: 87.5%; }
.fzd-co-table .is-num { font-stretch: 87.5%; }
.fzd-co-ref { font-weight: 600; font-variant-numeric: tabular-nums; font-size: 10.5px; }
.fzd-co-thumbs { display: flex; gap: 4px; }
.fzd-co-thumbs .fzd-drawing { background: var(--fzd-tint); border-radius: 4px; }
.fzd-co-name { font-weight: 600; font-size: 11px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fzd-co-loc { font-weight: 400; color: var(--fzd-muted); }
.fzd-co-meta { margin-top: 1px; font-size: 9.5px; line-height: 1.3; color: var(--fzd-muted); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.fzd-co-meta > span { white-space: nowrap; }
/* En el detalle compacto el color va en línea con el texto (sin caja flexible que lo levante). */
.fzd-co-meta .fzd-inline { display: inline; }
.fzd-co-meta .fzd-inline > span:first-child:not(:last-child) { margin-right: 4px; }
.fzd-co-meta > span:not(:last-child)::after { content: "·"; margin: 0 1px 0 5px; color: var(--fzd-faint); }
.fzd-co-close { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 32px; align-items: start; padding-top: 16px; }
.fzd-co-close__left { display: grid; gap: 14px; }
.fzd-co-count { font-size: 10.5px; color: var(--fzd-muted); }
.fzd-co-terms { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--fzd-rule); }
.fzd-quote--compacta .fzd-term__body { font-size: 9.5px; }

/* ── Editorial ───────────────────────────────────────────────────────────── */
.fzd-ed-cover__top { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding-bottom: 14px; border-bottom: 1px solid var(--fzd-ink); }
.fzd-ed-cover__no { font-size: 10.5px; color: var(--fzd-muted); font-variant-numeric: tabular-nums; }
.fzd-ed-cover__titles { margin-top: 40px; }
.fzd-ed-cover__title { margin-top: 10px; font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 50px; line-height: 1.02; max-width: 640px; }
.fzd-ed-cover__title--m { font-size: 38px; line-height: 1.06; }
.fzd-ed-cover__title--s { font-size: 30px; line-height: 1.08; }
.fzd-ed-cover__meta { margin-top: 12px; font-size: 13px; color: var(--fzd-ink-2); }
.fzd-ed-cover__stage { margin-top: 30px; padding: 20px 40px 14px; background: var(--fzd-tint); border-radius: 2px; display: flex; flex-direction: column; align-items: center; }
.fzd-ed-cover__caption { margin-top: 6px; font-size: 9.5px; color: var(--fzd-muted); }
.fzd-ed-cover__intro { margin-top: 24px; max-width: 560px; font-size: 13.5px; }
.fzd-ed-cover__facts { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 24px; padding-top: 14px; border-top: 1px solid var(--fzd-ink); }
.fzd-ed-cover__facts dt { font-size: 9.5px; color: var(--fzd-muted); margin-bottom: 4px; }
.fzd-ed-cover__facts dd { display: flex; flex-direction: column; font-size: 10.5px; line-height: 1.5; }
.fzd-ed-cover__total { text-align: right; }
.fzd-ed-cover__total dd { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 26px; line-height: 1.1; color: var(--fzd-accent-ink); align-items: flex-end; font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
.fzd-ed-item__head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 20px; align-items: end; padding-bottom: 16px; border-bottom: 1px solid var(--fzd-ink); }
.fzd-ed-item__ref { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: -0.03em; font-size: 58px; line-height: .86; color: var(--fzd-accent-ink); font-variant-numeric: tabular-nums lining-nums; }
.fzd-ed-item__titles .fzd-small { margin-top: 4px; }
.fzd-ed-item__price { text-align: right; }
.fzd-ed-item__amount { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 24px; line-height: 1.1; font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
.fzd-ed-item__stage { margin-top: 22px; display: grid; gap: 28px; align-items: start; }
.fzd-ed-figure { display: flex; flex-direction: column; gap: 7px; }
.fzd-ed-figure__well { border-radius: 2px; }
.fzd-ed-side { display: flex; flex-direction: column; gap: 22px; }
.fzd-ed-specs { display: grid; gap: 0; }
.fzd-ed-specs > div { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--fzd-rule); font-size: 11px; }
.fzd-ed-specs > div:first-child { border-top: 1px solid var(--fzd-rule); }
.fzd-ed-specs dt { color: var(--fzd-muted); font-size: 10px; padding-top: 1px; }
.fzd-ed-specs dd { display: flex; align-items: center; gap: 5px; min-width: 0; }
.fzd-ed-specs--row { margin-top: 20px; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 24px; }
.fzd-ed-item__note { margin-top: 18px; font-size: 11.5px; color: var(--fzd-ink-2); padding-left: 10px; border-left: 2px solid var(--fzd-accent-line); }
.fzd-ed-closing-head { margin-bottom: 14px; }
.fzd-ed-closing-head .fzd-h2 { margin-top: 4px; }
.fzd-ed-summary { margin-bottom: 8px; }
.fzd-ed-summary td { padding-top: 6px; padding-bottom: 6px; }
.fzd-ed-close { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 32px; align-items: start; padding-top: 18px; }
.fzd-ed-close__left { display: grid; gap: 14px; min-width: 0; }
.fzd-ed-terms { margin-top: 26px; padding-top: 16px; border-top: 1px solid var(--fzd-rule); }
.fzd-quote--editorial .fzd-accept { border-top-color: var(--fzd-ink); }

/* ── Catálogo: piezas comunes ────────────────────────────────────────────── */
.fzd-cat-price { font-size: 11px; color: var(--fzd-ink-2); font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
.fzd-cat-price .fzd-money { font-weight: 600; color: var(--fzd-accent-ink); }
.fzd-cat-price__from, .fzd-cat-price__unit { color: var(--fzd-muted); font-size: 10px; }
.fzd-cat-price--ask { color: var(--fzd-muted); font-size: 10px; }
.fzd-cat-colors { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.fzd-cat-colors--names { gap: 6px 12px; }
.fzd-cat-color { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; color: var(--fzd-ink-2); }
.fzd-cat-lineup { display: flex; align-items: flex-end; justify-content: center; }

/* ── Vitrina ─────────────────────────────────────────────────────────────── */
.fzd-vi-cover__top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
.fzd-vi-cover__head { margin-top: 70px; max-width: 560px; }
.fzd-vi-cover__title { margin: 8px 0 14px; font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 48px; line-height: 1.03; }
.fzd-vi-cover__stage { padding: 34px 32px 30px; background: var(--fzd-tint); border-radius: 12px; }
.fzd-vi-index { display: grid; border-top: 1px solid var(--fzd-ink); }
.fzd-vi-index li { display: grid; grid-template-columns: 30px auto minmax(0, 1fr) auto; gap: 12px; align-items: baseline; padding: 9px 0; border-bottom: 1px solid var(--fzd-rule); font-size: 11.5px; }
.fzd-vi-index__n { font-variant-numeric: tabular-nums; color: var(--fzd-accent-ink); font-weight: 600; font-size: 10.5px; }
.fzd-vi-index__count { font-size: 10px; color: var(--fzd-muted); }
.fzd-vi-cover--dense .fzd-vi-cover__head { margin-top: 40px; }
.fzd-vi-cover--dense .fzd-vi-cover__title { font-size: 42px; margin-bottom: 10px; }
.fzd-vi-cover--dense .fzd-vi-cover__stage { padding: 22px 28px 20px; }
.fzd-vi-index--cols { grid-auto-flow: column; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; }
.fzd-vi-index--cols li { grid-template-columns: 24px minmax(0, 1fr) auto; gap: 8px; padding: 6px 0; font-size: 11px; }
.fzd-vi-index__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fzd-vi-index .fzd-vi-index__more { display: block; font-size: 10px; color: var(--fzd-muted); }
.fzd-vi-line { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 28px; align-items: end; padding: 6px 0 16px; margin-bottom: 18px; border-bottom: 1px solid var(--fzd-ink); break-inside: avoid; }
.fzd-vi-line__name { margin: 2px 0; font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 28px; line-height: 1.1; }
.fzd-vi-line__aside { display: grid; gap: 10px; justify-items: end; text-align: right; }
.fzd-vi-line__desc { font-size: 11px; color: var(--fzd-ink-2); max-width: 300px; }
.fzd-vi-cont { display: flex; align-items: baseline; gap: 8px; padding-bottom: 6px; margin-bottom: 12px; border-bottom: 1px solid var(--fzd-rule); font-size: 11px; }
.fzd-vi-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 22px; break-inside: avoid; }
.fzd-vi-card { display: grid; gap: 5px; align-content: start; }
.fzd-vi-card__well { height: 172px; margin-bottom: 6px; border-radius: 8px; }

/* ── Ficha técnica ───────────────────────────────────────────────────────── */
.fzd-fi-header { padding-bottom: 18px; margin-bottom: 22px; border-bottom: 1px solid var(--fzd-ink); }
.fzd-fi-sheet { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 32px; align-items: start; }
.fzd-fi-sheet + .fzd-fi-sheet { margin-top: 28px; padding-top: 28px; border-top: 1px solid var(--fzd-rule-strong, var(--fzd-rule)); }
.fzd-fi-side { display: grid; gap: 11px; align-content: start; padding-right: 4px; }
.fzd-fi-name { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 30px; line-height: 1.05; margin-top: -8px; }
.fzd-fi-name--l { font-size: 25px; }
.fzd-fi-name--xl { font-size: 21px; line-height: 1.1; }
.fzd-fi-desc { margin-top: -6px; }
.fzd-fi-specs { display: grid; border-top: 1px solid var(--fzd-rule); }
.fzd-fi-specs > div { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px solid var(--fzd-rule); font-size: 11px; }
.fzd-fi-specs dt { color: var(--fzd-muted); font-size: 10px; }
.fzd-fi-group { display: grid; gap: 7px; }
.fzd-fi-glass { display: grid; gap: 5px; font-size: 10.5px; color: var(--fzd-ink-2); }
.fzd-fi-glass li { display: flex; align-items: center; gap: 6px; }
.fzd-fi-main__head { display: flex; justify-content: space-between; font-size: 9.5px; color: var(--fzd-muted); padding-bottom: 6px; border-bottom: 1px solid var(--fzd-ink); }
.fzd-fi-row { display: grid; grid-template-columns: 62px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--fzd-rule); break-inside: avoid; }
.fzd-fi-row__thumb { width: 62px; height: 50px; border-radius: 5px; }
.fzd-fi-row__name .fzd-small { margin-top: 1px; }
.fzd-fi-note { margin-top: 12px; }

/* ── Lookbook ────────────────────────────────────────────────────────────── */
.fzd-lb-cover__top { display: flex; align-items: center; gap: 10px; }
.fzd-lb-cover__stage { margin-top: 30px; flex: 1 1 auto; display: flex; align-items: center; justify-content: center; background: var(--fzd-tint); border-radius: 2px; min-height: 560px; }
.fzd-lb-cover__titles { margin-top: 30px; }
.fzd-lb-cover__title { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 52px; line-height: 1.02; margin-bottom: 10px; }
.fzd-lb-page .fzd-page__body { display: grid; grid-template-rows: 1fr 1fr; gap: 28px; }
.fzd-lb-item { display: grid; grid-template-columns: 60% minmax(0, 1fr); gap: 28px; align-items: center; break-inside: avoid; }
.fzd-lb-item--flip { grid-template-columns: minmax(0, 1fr) 60%; }
.fzd-lb-item--flip .fzd-lb-item__stage { order: 2; }
.fzd-lb-item__stage { height: 420px; border-radius: 2px; }
.fzd-lb-item__text { display: grid; gap: 8px; align-content: center; }
.fzd-lb-item__name { font-family: var(--fzd-display); font-weight: var(--fzd-display-weight); letter-spacing: var(--fzd-display-tracking); font-size: 28px; line-height: 1.08; }
`
