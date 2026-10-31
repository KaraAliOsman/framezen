import type { ReactNode } from 'react'
import type { Line } from '@framezen/engine'
import { clsx } from '../base/clsx'
import { formatClp, formatDateLong, formatNumber, joinParts } from '../base/format'
import { chunk, paginate, type FlowBlock } from '../base/paginate'
import { DocFooter, DocHeader, DocPage, DocRoot, GlassGlyph, OrgMark, Swatch, orgContactLines } from '../base/primitives'
import { pageContentHeight, pageContentWidth, themeFromPrefs, type DocTheme } from '../base/theme'
import { colorHex } from '../drawing/colors'
import { WindowDrawing } from '../drawing/WindowDrawing'
import type { CatalogDocData, CatalogDocEntry, CatalogDocTypology, CatalogDocumentProps, CatalogTemplateId } from './types'

export const CATALOG_TEMPLATES: { id: CatalogTemplateId; name: string; description: string }[] = [
  { id: 'vitrina', name: 'Vitrina', description: 'Portada y tarjetas de tres por fila, línea por línea.' },
  { id: 'ficha', name: 'Ficha técnica', description: 'Una hoja por línea con especificaciones y tipologías con precio.' },
  { id: 'lookbook', name: 'Lookbook', description: 'Dibujos grandes y poco texto, para inspirar.' },
]

interface CatCtx {
  data: CatalogDocData
  theme: DocTheme
  title: string
}

const KIND_LABEL: Record<Line['kind'], string> = { casement: 'Practicable', sliding: 'Corredera' }
const MATERIAL_LABEL: Record<Line['material'], string> = { pvc: 'PVC', aluminum: 'Aluminio' }

function lineFacts(line: Line): string {
  return joinParts([
    MATERIAL_LABEL[line.material],
    KIND_LABEL[line.kind],
    line.depth ? `${formatNumber(line.depth)} mm` : undefined,
    line.chambers ? `${line.chambers} ${line.chambers === 1 ? 'cámara' : 'cámaras'}` : undefined,
  ])
}

function FromPrice({ value, long = false }: { value?: number; long?: boolean }) {
  // Sin precio o con datos incompletos en el catálogo: no se publica un «desde» engañoso.
  if (!value || value <= 0) return <span className="fzd-cat-price fzd-cat-price--ask">Precio a consultar</span>
  return (
    <span className="fzd-cat-price">
      <span className="fzd-cat-price__from">Desde</span> <span className="fzd-money">{formatClp(value)}</span>
      <span className="fzd-cat-price__unit">{long ? ' por m² + IVA' : '/m²'}</span>
    </span>
  )
}

function ColorRow({ ctx, line, names = false }: { ctx: CatCtx; line: Line; names?: boolean }) {
  const colors = line.colorIds.map((id) => ctx.data.catalog.colors.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c)
  if (colors.length === 0) return null
  return (
    <div className={clsx('fzd-cat-colors', names && 'fzd-cat-colors--names')}>
      {colors.map((c) => (
        <span key={c.id} className="fzd-cat-color">
          <Swatch color={colorHex(c.id, ctx.data.catalog)} size="lg" title={c.name} />
          {names ? <span>{c.name}</span> : null}
        </span>
      ))}
    </div>
  )
}

function Drawing({ ctx, t, width, height, dims = 'none', colorId }: { ctx: CatCtx; t: CatalogDocTypology; width: number; height: number; dims?: 'none' | 'total'; colorId?: string }) {
  const design = colorId ? { ...t.design, colorId, colorInId: undefined } : t.design
  return <WindowDrawing layout={t.layout} design={design} catalog={ctx.data.catalog} width={width} height={height} dimensions={dims} title={t.name} />
}

function footer(ctx: CatCtx, page: number, pages: number): ReactNode {
  const { data } = ctx
  return (
    <DocFooter
      page={page}
      pages={pages}
      left={data.prefs.footer || joinParts([data.org.name, data.org.phone, data.org.website?.replace(/^https?:\/\//, '')])}
      right={`${ctx.title} · Página ${page} de ${pages}`}
    />
  )
}

/** Fila de dibujos a la misma escala (portadas). */
function Lineup({ ctx, items, width, height }: { ctx: CatCtx; items: CatalogDocTypology[]; width: number; height: number }) {
  const gap = 28
  const list = items.slice(0, 5)
  const sumW = list.reduce((acc, t) => acc + t.design.width, 0)
  const maxH = list.reduce((acc, t) => Math.max(acc, t.design.height), 1)
  const scale = Math.min((width - gap * Math.max(0, list.length - 1)) / Math.max(1, sumW), height / maxH)
  return (
    <div className="fzd-cat-lineup" style={{ gap }}>
      {list.map((t, i) => (
        <Drawing key={`${t.typologyId}-${i}`} ctx={ctx} t={t} width={t.design.width * scale + 4} height={t.design.height * scale + 4} />
      ))}
    </div>
  )
}

function allTypologies(entries: CatalogDocEntry[]): CatalogDocTypology[] {
  return entries.flatMap((e) => e.typologies)
}

/** Nombre de línea sin cortes feos: las palabras con guion («S-70») no se parten. */
function LineName({ name }: { name: string }) {
  const parts = name.split(/(\S*-\S*)/)
  return <>{parts.map((part, i) => (part.includes('-') ? <span key={i} style={{ whiteSpace: 'nowrap' }}>{part}</span> : part))}</>
}

/** «Kompen, Proline y Winhouse». */
function brandList(entries: CatalogDocEntry[]): string {
  const names = [...new Set(entries.map((e) => e.brand.name.trim()).filter(Boolean))]
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** En la portada caben unas 26 líneas en dos columnas; el resto se nombra al final. */
const COVER_INDEX_MAX = 26
/** Con más de 6 líneas el índice de la portada pasa a dos columnas compactas. */
const COVER_INDEX_DENSE = 6

// ── Vitrina ──────────────────────────────────────────────────────────────────

type VBlock = { kind: 'lineHead'; entry: CatalogDocEntry } | { kind: 'cards'; entry: CatalogDocEntry; items: CatalogDocTypology[] }

function Vitrina({ ctx }: { ctx: CatCtx }) {
  const { data, theme } = ctx
  const H = pageContentHeight(theme.paper)
  const W = pageContentWidth(theme.paper)
  const cardW = Math.floor((W - 2 * 16) / 3)
  // Altos medidos en Chromium: fila de tarjetas 243 px; título de línea 105 px (+31 si el nombre
  // ocupa dos líneas, + la descripción larga). Una línea puede seguir en la hoja siguiente: ahí
  // la encabeza «<línea> · continuación» (CONT_H), así ninguna hoja queda a medio llenar.
  const ROW_H = 244
  const CONT_H = 30
  const headHeight = (entry: CatalogDocEntry) => {
    const descLines = Math.ceil((entry.line.description?.length ?? 0) / 55)
    return 108 + (entry.line.name.length > 20 ? 31 : 0) + Math.max(0, descLines - 3) * 16
  }
  const blocks: FlowBlock<VBlock>[] = data.entries.flatMap((entry, i) => [
    { key: `h${i}`, height: headHeight(entry), data: { kind: 'lineHead' as const, entry }, keepWithNext: true },
    ...chunk(entry.typologies, 3).map((items, j) => ({ key: `c${i}-${j}`, height: ROW_H, data: { kind: 'cards' as const, entry, items } })),
  ])
  const pages = paginate(blocks, { first: H - 57 - CONT_H, rest: H - 57 - CONT_H })
  const total = pages.length + 1
  const dense = data.entries.length > COVER_INDEX_DENSE
  const indexed = data.entries.slice(0, COVER_INDEX_MAX)
  const hidden = data.entries.length - indexed.length
  const indexRows = Math.ceil((indexed.length + (hidden > 0 ? 1 : 0)) / 2)
  return (
    <>
      <DocPage footer={footer(ctx, 1, total)} className={clsx('fzd-vi-cover', dense && 'fzd-vi-cover--dense')} label="Portada">
        <div className="fzd-vi-cover__top">
          <div className="fzd-brand">
            <OrgMark org={data.org} />
            <div className="fzd-brand__text">
              <div className="fzd-brand__name">{data.org.name}</div>
              {orgContactLines(data.org).map((l) => (
                <div key={l} className="fzd-brand__meta">
                  {l}
                </div>
              ))}
            </div>
          </div>
          {data.date ? <div className="fzd-small">{formatDateLong(data.date)}</div> : null}
        </div>
        <div className="fzd-vi-cover__head">
          <div className="fzd-label fzd-accent">Catálogo</div>
          <h1 className="fzd-vi-cover__title">{ctx.title}</h1>
          <p className="fzd-lead">Fabricamos a medida cada ventana y puerta. Estas son las líneas y diseños con los que trabajamos; elige el que más te guste y te lo cotizamos.</p>
        </div>
        <div className="fzd-page__spacer" />
        <div className="fzd-vi-cover__stage">
          <Lineup ctx={ctx} items={allTypologies(data.entries).filter((_, i) => i % 2 === 0)} width={W - 64} height={dense ? 150 : 250} />
        </div>
        <div className="fzd-page__spacer" />
        <ol className={clsx('fzd-vi-index', dense && 'fzd-vi-index--cols')} style={dense ? { gridTemplateRows: `repeat(${indexRows}, auto)` } : undefined}>
          {indexed.map((e, i) =>
            dense ? (
              <li key={e.line.id + i}>
                <span className="fzd-vi-index__n">{String(i + 1).padStart(2, '0')}</span>
                <span className="fzd-vi-index__name">
                  <span className="fzd-strong">{e.line.name}</span> <span className="fzd-muted">{e.brand.name}</span>
                </span>
                <span className="fzd-vi-index__count">
                  {e.typologies.length} {e.typologies.length === 1 ? 'diseño' : 'diseños'}
                </span>
              </li>
            ) : (
              <li key={e.line.id + i}>
                <span className="fzd-vi-index__n">{String(i + 1).padStart(2, '0')}</span>
                <span className="fzd-strong">{e.line.name}</span>
                <span className="fzd-muted">{joinParts([e.brand.name, lineFacts(e.line)])}</span>
                <span className="fzd-vi-index__count">
                  {e.typologies.length} {e.typologies.length === 1 ? 'diseño' : 'diseños'}
                </span>
              </li>
            ),
          )}
          {hidden > 0 ? (
            <li className="fzd-vi-index__more">
              y {hidden} {hidden === 1 ? 'línea más' : 'líneas más'} en las páginas siguientes
            </li>
          ) : null}
        </ol>
      </DocPage>
      {pages.map((page, p) => (
        <DocPage key={p} footer={footer(ctx, p + 2, total)} label={`Página ${p + 2}`}>
          <DocHeader org={data.org} kind={ctx.title} variant="compact" className="fzd-running" />
          {page[0]?.data.kind === 'cards' ? (
            <div className="fzd-vi-cont">
              <span className="fzd-strong">{page[0].data.entry.line.name}</span>
              <span className="fzd-muted">{joinParts([page[0].data.entry.brand.name, 'continuación'])}</span>
            </div>
          ) : null}
          {page.map((block) =>
            block.data.kind === 'lineHead' ? (
              <header key={block.key} className="fzd-vi-line">
                <div>
                  <div className="fzd-label">{block.data.entry.brand.name}</div>
                  <h2 className="fzd-vi-line__name">
                    <LineName name={block.data.entry.line.name} />
                  </h2>
                  <div className="fzd-small">{lineFacts(block.data.entry.line)}</div>
                </div>
                <div className="fzd-vi-line__aside">
                  {block.data.entry.line.description ? <p className="fzd-vi-line__desc">{block.data.entry.line.description}</p> : null}
                  <ColorRow ctx={ctx} line={block.data.entry.line} />
                </div>
              </header>
            ) : (
              <div key={block.key} className="fzd-vi-row">
                {block.data.items.map((t, i) => (
                  <article key={`${t.typologyId}-${i}`} className="fzd-vi-card">
                    <div className="fzd-well fzd-vi-card__well">
                      <Drawing ctx={ctx} t={t} width={cardW - 28} height={150} />
                    </div>
                    <h3 className="fzd-h3">{t.name}</h3>
                    <FromPrice value={t.fromPricePerM2} />
                  </article>
                ))}
              </div>
            ),
          )}
        </DocPage>
      ))}
    </>
  )
}

// ── Ficha técnica ────────────────────────────────────────────────────────────

/** Una línea (o un tramo de ella, `part` > 0 si es continuación) en una hoja de la ficha. */
export type FichaBlock = { key: string; entry: CatalogDocEntry; items: CatalogDocTypology[]; part: number }

/** Filas de datos de la ficha: «Diseños» solo si la línea sigue en otra hoja (si no, se ven todos). */
function fichaSpecRows(entry: CatalogDocEntry, split: boolean): number {
  return 2 + (entry.line.depth ? 1 : 0) + (entry.line.chambers ? 1 : 0) + (split ? 1 : 0)
}

/**
 * Alto estimado (px) del costado de la ficha (medido en Chromium): marca 14, nombre 26–53,
 * descripción 15 por línea, datos 28 por fila, colores de a tres por fila, vidrios 21 c/u.
 */
function fichaSideHeight(entry: CatalogDocEntry, glassCount: number, split: boolean): number {
  const name = entry.line.name.length
  const nameH = name <= 13 ? 32 : name <= 17 ? 26 : name <= 22 ? 53 : 24 * Math.ceil(name / 16) + 4
  const desc = entry.line.description ? 15 * Math.ceil(entry.line.description.length / 34) - 6 + 11 : 0
  const specs = 28 * fichaSpecRows(entry, split) + 1 + 11
  const colors = entry.line.colorIds.length ? 16 + 22 * Math.ceil(entry.line.colorIds.length / 3) + 11 : 0
  const glass = glassCount ? 16 + 21 * glassCount + 11 : 0
  return 14 + 11 + nameH - 8 + desc + specs + colors + glass - 11 + 8
}

/**
 * Reparte las líneas de la ficha en hojas. Cada línea va entera si cabe; si no:
 * - en una hoja vacía (línea más larga que una hoja) se parte en tramos parejos;
 * - en una hoja empezada solo se parte si, de no hacerlo, quedaría más del 40 % libre
 *   (con al menos 3 diseños en esta hoja), así no quedan hojas a medio llenar.
 * La continuación nunca queda con un solo diseño y repite el costado de la línea.
 */
export function fichaPages(
  entries: CatalogDocEntry[],
  opts: { first: number; rest: number; gap: number; sideHeight: (entry: CatalogDocEntry, split: boolean) => number },
): FichaBlock[][] {
  const pages: FichaBlock[][] = [[]]
  let used = 0
  const budget = () => (pages.length === 1 ? opts.first : opts.rest)
  const newPage = () => {
    pages.push([])
    used = 0
  }
  const blockHeight = (entry: CatalogDocEntry, rows: number, split: boolean) => Math.max(opts.sideHeight(entry, split), 21 + 67 * rows + 46) + opts.gap
  entries.forEach((entry, e) => {
    const all = entry.typologies
    let start = 0
    let part = 0
    // Tope de vueltas: cada una coloca algo o abre una hoja vacía.
    for (let guard = 0; guard < 4 * (all.length + 2); guard++) {
      const left = all.length - start
      const split = part > 0 || left < all.length
      const free = budget() - used
      const current = pages[pages.length - 1] as FichaBlock[]
      const whole = blockHeight(entry, left, split)
      if (whole <= free || (current.length === 0 && left <= 1)) {
        current.push({ key: `${entry.line.id}-${e}-${part}`, entry, items: all.slice(start), part })
        used += whole
        return
      }
      let fit = 0
      while (fit < left && blockHeight(entry, fit + 1, true) <= free) fit++
      const empty = current.length === 0
      let rows = 0
      if (empty) {
        // Línea más larga que una hoja: tramos parejos (13 → 7 + 6, nunca 11 + 2).
        rows = fit > 0 ? Math.ceil(left / Math.ceil(left / fit)) : 0
        if (rows === 0) {
          // Ni un diseño cabe junto al costado (no debería pasar): va igual, sin perder datos.
          current.push({ key: `${entry.line.id}-${e}-${part}`, entry, items: all.slice(start), part })
          used += whole
          return
        }
      } else if (free > 0.4 * budget()) {
        rows = Math.min(fit, left)
        if (left - rows === 1) rows -= 1
        if (rows < 3) rows = 0
      }
      if (rows > 0) {
        current.push({ key: `${entry.line.id}-${e}-${part}`, entry, items: all.slice(start, start + rows), part })
        used += blockHeight(entry, rows, true)
        start += rows
        part++
      }
      newPage()
    }
  })
  return pages.filter((page, i) => page.length > 0 || i === 0)
}

function Ficha({ ctx }: { ctx: CatCtx }) {
  const { data, theme } = ctx
  const H = pageContentHeight(theme.paper)
  const glassOf = (entry: CatalogDocEntry) =>
    (entry.glassIds ?? []).map((id) => data.catalog.glass.find((g) => g.id === id)).filter((g): g is NonNullable<typeof g> => !!g)
  // Si caben, varias líneas comparten hoja (una corredera de 3 diseños ya no deja media hoja en
  // blanco) y una línea larga sigue en la hoja siguiente sin dejar huecos grandes.
  const SHEET_GAP = 57
  const pages = fichaPages(data.entries, {
    first: H - 81 + SHEET_GAP,
    rest: H - 57 + SHEET_GAP,
    gap: SHEET_GAP,
    sideHeight: (entry, split) => fichaSideHeight(entry, glassOf(entry).length, split),
  }).map((page) => page.map((part) => ({ key: part.key, data: part })))
  return (
    <>
      {pages.map((page, p) => (
        <DocPage key={`page-${p}`} footer={footer(ctx, p + 1, pages.length)} label={page.map((b) => b.data.entry.line.name).join(' · ')}>
          <DocHeader
            org={data.org}
            kind="Ficha técnica"
            variant={p === 0 ? 'full' : 'compact'}
            className={p === 0 ? 'fzd-fi-header' : 'fzd-running'}
            context={p === 0 ? undefined : page.map((b) => b.data.entry.line.name).join(' · ')}
          />
          {page.map((block) => {
            const { entry, items } = block.data
            const glass = glassOf(entry)
            return (
          <div key={block.key} className="fzd-fi-sheet">
            <aside className="fzd-fi-side">
              <div className="fzd-label fzd-accent">{entry.brand.name}</div>
              <h2 className={clsx('fzd-fi-name', entry.line.name.length > 22 ? 'fzd-fi-name--xl' : entry.line.name.length > 13 && 'fzd-fi-name--l')}>
                <LineName name={entry.line.name} />
              </h2>
              {entry.line.description ? <p className="fzd-small fzd-fi-desc">{entry.line.description}</p> : null}
              <dl className="fzd-fi-specs">
                <div>
                  <dt>Material</dt>
                  <dd>{MATERIAL_LABEL[entry.line.material]}</dd>
                </div>
                <div>
                  <dt>Sistema</dt>
                  <dd>{KIND_LABEL[entry.line.kind]}</dd>
                </div>
                {entry.line.depth ? (
                  <div>
                    <dt>Profundidad</dt>
                    <dd className="fzd-num">{formatNumber(entry.line.depth)} mm</dd>
                  </div>
                ) : null}
                {entry.line.chambers ? (
                  <div>
                    <dt>Cámaras</dt>
                    <dd className="fzd-num">{entry.line.chambers}</dd>
                  </div>
                ) : null}
                {entry.typologies.length > items.length ? (
                  <div>
                    <dt>Diseños</dt>
                    <dd className="fzd-num">{entry.typologies.length}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="fzd-fi-group">
                <div className="fzd-label">Colores</div>
                <ColorRow ctx={ctx} line={entry.line} names />
              </div>
              {glass.length ? (
                <div className="fzd-fi-group">
                  <div className="fzd-label">Vidrios</div>
                  <ul className="fzd-fi-glass">
                    {glass.map((g, i) => (
                      <li key={g.id}>
                        <GlassGlyph kind={g.kind} size={11} />
                        <span>
                          {g.name}
                          {i === 0 ? <span className="fzd-muted"> · base del precio</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
            <section className="fzd-fi-main">
              <div className="fzd-fi-main__head">
                <span>Diseño</span>
                <span>Precio referencial</span>
              </div>
              {items.map((t, i) => (
                <div key={`${t.typologyId}-${i}`} className="fzd-fi-row">
                  <div className="fzd-well fzd-fi-row__thumb">
                    <Drawing ctx={ctx} t={t} width={54} height={50} />
                  </div>
                  <div className="fzd-fi-row__name">
                    <div className="fzd-strong">{t.name}</div>
                    <div className="fzd-small fzd-num">
                      Referencia {formatNumber(t.design.width)} × {formatNumber(t.design.height)} mm
                    </div>
                  </div>
                  <FromPrice value={t.fromPricePerM2} long />
                </div>
              ))}
              <p className="fzd-small fzd-fi-note">Precios referenciales por m² sin IVA. Cada ventana se cotiza a medida con su color, vidrio e instalación.</p>
            </section>
          </div>
            )
          })}
        </DocPage>
      ))}
    </>
  )
}

// ── Lookbook ─────────────────────────────────────────────────────────────────

function Lookbook({ ctx }: { ctx: CatCtx }) {
  const { data, theme } = ctx
  const W = pageContentWidth(theme.paper)
  const all = data.entries.flatMap((entry) => entry.typologies.map((t) => ({ entry, t })))
  const spreads = chunk(all, 2)
  const hero = [...all].sort((a, b) => b.t.design.width * b.t.design.height - a.t.design.width * a.t.design.height)[0]
  const total = spreads.length + 1
  return (
    <>
      <DocPage footer={footer(ctx, 1, total)} className="fzd-lb-cover" label="Portada">
        <div className="fzd-lb-cover__top">
          <OrgMark org={data.org} />
          <span className="fzd-small">{data.org.name}</span>
        </div>
        <div className="fzd-lb-cover__stage">
          {hero ? <Drawing ctx={ctx} t={hero.t} width={W - 120} height={500} /> : null}
        </div>
        <div className="fzd-lb-cover__titles">
          <h1 className="fzd-lb-cover__title">{ctx.title}</h1>
          <p className="fzd-lead">
            {data.entries.length > 3
              ? joinParts([brandList(data.entries), `${data.entries.length} líneas`, `${all.length} diseños hechos a medida`])
              : joinParts([data.entries.map((e) => e.line.name).join(', '), `${all.length} ${all.length === 1 ? 'diseño hecho' : 'diseños hechos'} a medida`])}
          </p>
        </div>
      </DocPage>
      {spreads.map((pair, p) => (
        <DocPage key={p} footer={footer(ctx, p + 2, total)} className="fzd-lb-page" label={`Página ${p + 2}`}>
          {pair.map(({ entry, t }, i) => {
            // Cada diseño se muestra en otro color disponible de la línea, para inspirar.
            const colorId = entry.line.colorIds.length ? entry.line.colorIds[(p * 2 + i) % entry.line.colorIds.length] : undefined
            const colorName = colorId ? data.catalog.colors.find((c) => c.id === colorId)?.name : undefined
            return (
            <article key={`${t.typologyId}-${i}`} className={clsx('fzd-lb-item', (p * 2 + i) % 2 === 1 && 'fzd-lb-item--flip')}>
              <div className="fzd-well fzd-lb-item__stage">
                <Drawing ctx={ctx} t={t} width={Math.round(W * 0.6) - 40} height={380} dims="total" colorId={colorId} />
              </div>
              <div className="fzd-lb-item__text">
                <div className="fzd-label">{joinParts([entry.brand.name, entry.line.name])}</div>
                <h2 className="fzd-lb-item__name">{t.name}</h2>
                <p className="fzd-small">{lineFacts(entry.line)}</p>
                <FromPrice value={t.fromPricePerM2} long />
                <ColorRow ctx={ctx} line={entry.line} />
                {colorName ? <p className="fzd-small">En la imagen: {colorName.toLowerCase()}</p> : null}
              </div>
            </article>
            )
          })}
        </DocPage>
      ))}
    </>
  )
}

/** Catálogo de productos del taller en tres diseños. */
export function CatalogDocument({ template, data, withStyles, className }: CatalogDocumentProps) {
  const theme = themeFromPrefs(data.prefs, data.org.accent)
  const ctx: CatCtx = { data, theme, title: data.title?.trim() || 'Catálogo de ventanas y puertas' }
  const body = template === 'ficha' ? <Ficha ctx={ctx} /> : template === 'lookbook' ? <Lookbook ctx={ctx} /> : <Vitrina ctx={ctx} />
  return (
    <DocRoot theme={theme} withStyles={withStyles} className={clsx('fzd-catalog', `fzd-catalog--${template}`, className)} label={ctx.title}>
      {body}
    </DocRoot>
  )
}
