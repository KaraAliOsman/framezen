/**
 * Bloques del catálogo (componentes de confianza, sin hooks). Cada uno dibuja exactamente el alto
 * que le reservó el paginador (`style.height`) y recorta lo que sobre: una tarjeta con un nombre
 * larguísimo se corta en su caja, nunca empuja la hoja.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { PlaceholderKey, RichBlock, RichInline } from '@dekopen/shared'
import { openingName, glossaryTerm, splitPlaceholders } from '@dekopen/shared'
import { EditableText } from '../../base/editable'
import { TypologyIcon } from '../../drawing/TypologyIcon'
import type { Block, BlockData, TocEntry } from './layout'
import { matrixRows } from './layout'
import type { FamilyModel, FinishModel, GlassModel, HardwareModel, ProductModel } from './model'
import { variantColor } from './model'
import {
  Drawing,
  FromPrice,
  OpeningGlyph,
  OrgLogo,
  RequestQr,
  Swatch,
  SwatchRow,
  contactParts,
  displayUrl,
  safeWebUrl,
  type CatalogRenderContext,
} from './parts'
import { lineMm } from './theme'

type Ctx = CatalogRenderContext

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')

function mm(n: number): string {
  return `${Math.round(n * 100) / 100}mm`
}

function toneClass(tone: Block['tone']): string | undefined {
  return tone === 'paper' ? undefined : `dkc-tone dkc-tone--${tone}`
}

// ── Texto con marcadores ─────────────────────────────────────────────────────

function placeholderValues(ctx: Ctx): Partial<Record<PlaceholderKey, string>> {
  const org = ctx.data.org
  return {
    'org.name': org.name,
    'org.legalName': org.legalName ?? org.name,
    'org.taxId': org.rut ?? '',
    'org.phone': org.phone ?? '',
    'org.email': org.email ?? '',
    'org.website': displayUrl(safeWebUrl(org.website)) ?? '',
    'org.address': org.address ?? '',
    'org.city': org.city ?? '',
    'catalog.title': ctx.title,
    'catalog.date': ctx.edition ?? '',
  }
}

/** Texto plano con marcadores reemplazados por datos (como texto, nunca HTML). */
export function fillText(ctx: Ctx, text: string): string {
  const values = placeholderValues(ctx)
  return splitPlaceholders(text)
    .map((s) => (s.type === 'text' ? s.text : (values[s.key] ?? '')))
    .join('')
}

function Inlines({ ctx, nodes }: { ctx: Ctx; nodes: readonly RichInline[] }) {
  const values = placeholderValues(ctx)
  return (
    <>
      {nodes.map((n, i) => {
        if (n.type === 'line_break') return <br key={i} />
        if (n.type === 'placeholder') return <span key={i}>{values[n.key] ?? ''}</span>
        let node: ReactNode = n.text
        if (n.italic) node = <em>{node}</em>
        if (n.bold) node = <strong>{node}</strong>
        return <span key={i}>{node}</span>
      })}
    </>
  )
}

function RichBlockView({ ctx, block }: { ctx: Ctx; block: RichBlock }) {
  switch (block.type) {
    case 'heading':
      return block.level === 2 ? (
        <h3 className="dkc-rich__h2">
          <Inlines ctx={ctx} nodes={block.children} />
        </h3>
      ) : (
        <h4 className="dkc-rich__h3">
          <Inlines ctx={ctx} nodes={block.children} />
        </h4>
      )
    case 'paragraph':
      return (
        <p className={cx('dkc-rich__p', block.align === 'center' && 'dkc-center')}>
          <Inlines ctx={ctx} nodes={block.children} />
        </p>
      )
    case 'bullet_list':
      return (
        <ul className="dkc-rich__list">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines ctx={ctx} nodes={item.children} />
            </li>
          ))}
        </ul>
      )
    case 'ordered_list':
      return (
        <ol className="dkc-rich__list">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines ctx={ctx} nodes={item.children} />
            </li>
          ))}
        </ol>
      )
  }
}

// ── Piezas de bloque ─────────────────────────────────────────────────────────

function Heading({ data, onTitle }: { data: Extract<BlockData, { kind: 'heading' }>; onTitle?: (value: string) => void }) {
  return (
    <header className="dkc-heading">
      {data.kicker ? <div className="dkc-kicker">{data.kicker}</div> : null}
      <h2 className="dkc-heading__title">{onTitle ? <EditableText as="span" inline value={data.title} editable onChange={onTitle} /> : data.title}</h2>
      {data.lead ? <p className="dkc-heading__lead">{data.lead}</p> : null}
    </header>
  )
}

function Toc({ ctx, entries }: { ctx: Ctx; entries: TocEntry[] }) {
  return (
    <ol className="dkc-toc">
      {entries.map((e) => (
        <li key={e.key} className={cx('dkc-toc__row', e.level === 1 && 'dkc-toc__row--sub')}>
          <span className="dkc-toc__label">{e.label}</span>
          <span className="dkc-toc__dots" aria-hidden="true" />
          <span className="dkc-toc__page">{e.page !== undefined ? ctx.fmt.number(e.page) : ''}</span>
        </li>
      ))}
    </ol>
  )
}

/** Las líneas del catálogo bajo el índice: la ventana de cada una, grande y apoyada abajo. */
function TocFamilies({ ctx, families, height }: { ctx: Ctx; families: FamilyModel[]; height: number }) {
  const u = ctx.metrics.u
  const rowH = (height - u - u * (families.length - 1)) / families.length
  const wellW = ctx.metrics.content.width * 0.62
  return (
    <div className="dkc-tocfam" style={{ gridAutoRows: mm(rowH), rowGap: mm(u), paddingTop: mm(u) }}>
      {families.map((f) => (
        <figure key={f.id} className="dkc-tocfam__item">
          <div className="dkc-tocfam__well" style={{ width: mm(wellW) }}>
            {f.hero ? <Drawing ctx={ctx} t={f.hero.source} width={wellW - 20} height={rowH - 14} title={f.hero.name} plain /> : null}
          </div>
          <figcaption>
            <span className="dkc-tocfam__name">{f.name}</span>
            {f.description ? <span className="dkc-tocfam__desc">{f.description}</span> : null}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

function GuideSteps({ ctx, height }: { ctx: Ctx; height: number }) {
  const steps = [1, 2, 3, 4] as const
  return (
    <ol className="dkc-steps" style={{ gridAutoRows: mm(height), gap: mm(ctx.metrics.u) }}>
      {steps.map((n) => (
        <li key={n} className="dkc-step">
          <span className="dkc-step__n">{String(n).padStart(2, '0')}</span>
          <h3 className="dkc-step__title">{ctx.t(`guide.step${n}`)}</h3>
          <p className="dkc-step__text">{ctx.t(`guide.step${n}Text`)}</p>
        </li>
      ))}
    </ol>
  )
}

function GuideOpenings({ ctx }: { ctx: Ctx }) {
  const kinds = ctx.model.openings
  return (
    <div className="dkc-openings">
      <h3 className="dkc-subhead">{ctx.t('guide.openingsTitle')}</h3>
      <ul className="dkc-openings__grid">
        {kinds.map((kind) => (
          <li key={kind} className="dkc-opening">
            <OpeningGlyph kind={kind} size={10} />
            <div>
              <div className="dkc-opening__name">{openingName(kind, ctx.locale)}</div>
              <div className="dkc-opening__hint">{glossaryTerm(`openingHint.${kind}` as never, ctx.locale)}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FactList({ rows, className }: { rows: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cx('dkc-facts', className)}>
      {rows.map((r) => (
        <div key={r.label} className="dkc-facts__row">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function familyFacts(ctx: Ctx, family: FamilyModel, opts: { price?: boolean; glazing?: boolean } = {}): { label: string; value: ReactNode }[] {
  const t = ctx.t
  const rows: { label: string; value: ReactNode }[] = [
    { label: t('family.material'), value: family.material },
    { label: t('family.system'), value: family.system },
  ]
  if (family.depth) rows.push({ label: t('family.depth'), value: <span className="dkc-num">{ctx.fmt.mm(family.depth, { unit: true })}</span> })
  if (family.chambers) rows.push({ label: t('family.chambers'), value: t('family.chambersValue', { count: family.chambers }) })
  if (opts.glazing !== false && family.maxGlass) rows.push({ label: t('family.glazing'), value: <span className="dkc-num">{t('family.glazingRange', { max: ctx.fmt.mm(family.maxGlass) })}</span> })
  if (opts.price && family.fromPrice) rows.push({ label: t('family.fromPrice'), value: <FromPrice ctx={ctx} value={family.fromPrice} /> })
  return rows
}

function IconStrip({ ctx, products, max = 10, labels = false }: { ctx: Ctx; products: readonly ProductModel[]; max?: number; labels?: boolean }) {
  const shown = products.slice(0, max)
  return (
    <ul className={cx('dkc-icons', labels && 'dkc-icons--labels')}>
      {shown.map((p) => (
        <li key={p.key} className="dkc-icons__item">
          <TypologyIcon typologyId={p.typologyId as never} size={labels ? 30 : 24} title={p.name} strokeWidth={1.4} />
          {labels ? <span className="dkc-icons__label">{p.name}</span> : null}
        </li>
      ))}
      {products.length > shown.length ? <li className="dkc-icons__more">+{products.length - shown.length}</li> : null}
    </ul>
  )
}

/** Color destacado de una familia: la primera madera/texturizada si existe (luce el foliado), si no el primero. */
function featureColor(family: FamilyModel): { colorId?: string; name?: string } {
  const pick = family.colors.find((c) => c.finish === 'woodgrain') ?? family.colors.find((c) => c.finish) ?? family.colors[0]
  return pick ? { colorId: pick.id, name: pick.name } : {}
}

// ── Familias ─────────────────────────────────────────────────────────────────

function FamilyLifestyle({ ctx, family, section }: { ctx: Ctx; family: FamilyModel; section: Extract<BlockData, { kind: 'familyLifestyle' }>['section'] }) {
  const m = ctx.metrics
  const H = m.content.height
  const W = m.content.width
  const heroH = H * 0.5
  const hero = family.hero
  const feature = featureColor(family)
  const o = section.options
  return (
    <article className="dkc-life">
      <div className="dkc-life__stage" style={{ height: mm(heroH) }}>
        {hero ? <Drawing ctx={ctx} t={hero.source} width={W * 0.8} height={heroH - 18} colorId={feature.colorId} title={hero.name} /> : null}
        {hero ? (
          <div className="dkc-life__caption">
            {ctx.t('family.signature', { name: feature.name ? `${hero.name} · ${feature.name}` : hero.name })}
          </div>
        ) : null}
      </div>
      <div className="dkc-life__body">
        <div className="dkc-life__intro">
          <div className="dkc-kicker">
            {ctx.t('family.kicker')} {String(family.index + 1).padStart(2, '0')}
            {family.brand ? ` · ${family.brand}` : ''}
          </div>
          <h2 className="dkc-life__name">{family.name}</h2>
          {family.description ? <p className="dkc-life__desc">{family.description}</p> : null}
        </div>
        <div className="dkc-life__side">
          <FactList rows={familyFacts(ctx, family, { price: o.showFromPrice })} />
          {family.colors.length ? (
            <div className="dkc-life__colors">
              <div className="dkc-label">{ctx.t('family.colors')}</div>
              <SwatchRow ctx={ctx} finishes={family.colors} max={6} />
            </div>
          ) : null}
        </div>
      </div>
      {o.showOpeningDiagrams && family.products.length ? (
        <div className="dkc-life__designs">
          <div className="dkc-label">{ctx.t('family.products')}</div>
          <IconStrip ctx={ctx} products={family.products} max={8} labels />
        </div>
      ) : null}
    </article>
  )
}

function FamilySheet({ ctx, family, section }: { ctx: Ctx; family: FamilyModel; section: Extract<BlockData, { kind: 'familySheet' }>['section'] }) {
  const m = ctx.metrics
  const W = m.content.width
  const H = m.content.height
  const hero = family.hero
  const o = section.options
  const leftW = W * 0.4
  const drawW = W - leftW - m.u * 1.5
  const drawH = H * 0.5
  const openings = family.openings.filter((k) => k !== 'fixed')
  return (
    <article className="dkc-sheet">
      <header className="dkc-sheet__band">
        <span className="dkc-sheet__code">{family.letter}</span>
        <div className="dkc-sheet__title">
          <h2>{family.name}</h2>
          <span>{[family.brand, family.system, family.depth ? ctx.fmt.mm(family.depth, { unit: true }) : undefined].filter(Boolean).join(' · ')}</span>
        </div>
      </header>
      <div className="dkc-sheet__grid">
        <div className="dkc-sheet__specs" style={{ width: mm(leftW) }}>
          {family.description ? <p className="dkc-sheet__desc">{family.description}</p> : null}
          <FactList className="dkc-facts--rules" rows={familyFacts(ctx, family, { price: o.showFromPrice })} />
          {o.showOpeningDiagrams && (openings.length || family.line.kind === 'sliding') ? (
            <div className="dkc-sheet__group">
              <div className="dkc-label">{ctx.t('family.openings')}</div>
              <ul className="dkc-sheet__openings">
                {family.line.kind === 'sliding' ? (
                  <li>
                    <OpeningGlyph kind="sliding" size={6.5} />
                    <span>{family.system}</span>
                  </li>
                ) : null}
                {openings.map((k) => (
                  <li key={k}>
                    <OpeningGlyph kind={k} size={6.5} />
                    <span>{openingName(k, ctx.locale)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {family.colors.length ? (
            <div className="dkc-sheet__group">
              <div className="dkc-label">{ctx.t('family.colors')}</div>
              <SwatchRow ctx={ctx} finishes={family.colors} names max={8} />
            </div>
          ) : null}
        </div>
        <figure className="dkc-sheet__figure" style={{ width: mm(drawW) }}>
          <div className="dkc-sheet__drawing" style={{ height: mm(drawH) }}>
            {hero ? <Drawing ctx={ctx} t={hero.source} width={drawW - 6} height={drawH - 6} dims="total" title={hero.name} /> : null}
          </div>
          {hero ? (
            <figcaption className="dkc-caption">
              <span>{hero.name}</span>
              <span>{glossaryTerm('view.interior', ctx.locale)} · {ctx.fmt.size(hero.source.design.width, hero.source.design.height)}</span>
            </figcaption>
          ) : null}
          <div className="dkc-label dkc-sheet__products-label">{ctx.t('family.products')}</div>
          <ul className="dkc-sheet__products">
            {family.products.slice(0, 12).map((p) => (
              <li key={p.key}>
                <TypologyIcon typologyId={p.typologyId as never} size={22} title={p.name} strokeWidth={1.4} />
                <span className="dkc-code">{p.code}</span>
                <span className="dkc-sheet__pname">{p.name}</span>
              </li>
            ))}
          </ul>
        </figure>
      </div>
      <p className="dkc-note dkc-sheet__note">{ctx.t('family.sheetNote')}</p>
    </article>
  )
}

function FamilyTiles({ ctx, families, section }: { ctx: Ctx; families: FamilyModel[]; section: Extract<BlockData, { kind: 'familyTiles' }>['section'] }) {
  const m = ctx.metrics
  const colW = (m.content.width - m.u) / 2
  const o = section.options
  return (
    <div className="dkc-tiles">
      {families.map((family) => (
        <article key={family.id} className="dkc-tile" style={{ width: mm(colW) }}>
          <header className="dkc-tile__head">
            <span className="dkc-badge">{family.letter}</span>
            <div className="dkc-tile__title">
              <h3>{family.name}</h3>
              <span>{[family.brand, family.system].filter(Boolean).join(' · ')}</span>
            </div>
            <span className="dkc-tile__count">{ctx.t('document.products', { count: family.products.length })}</span>
          </header>
          <div className="dkc-tile__well">
            {family.hero ? <Drawing ctx={ctx} t={family.hero.source} width={colW - 10} height={40} colorId={featureColor(family).colorId} title={family.hero.name} /> : null}
          </div>
          <div className="dkc-tile__meta">
            <span>{[family.material, family.depth ? ctx.fmt.mm(family.depth, { unit: true }) : undefined, family.chambers ? ctx.t('family.chambersValue', { count: family.chambers }) : undefined].filter(Boolean).join(' · ')}</span>
            {o.showFromPrice ? <FromPrice ctx={ctx} value={family.fromPrice} /> : null}
          </div>
          {o.showOpeningDiagrams ? <IconStrip ctx={ctx} products={family.products} max={9} /> : null}
        </article>
      ))}
    </div>
  )
}

// ── Productos ────────────────────────────────────────────────────────────────

function Chapter({ ctx, family, continued, showQr }: { ctx: Ctx; family: FamilyModel; continued: boolean; showQr: boolean }) {
  return (
    <header className="dkc-chapter">
      <span className="dkc-badge dkc-badge--solid">{family.letter}</span>
      <div className="dkc-chapter__title">
        <h3>{continued ? ctx.t('document.continued', { name: family.name }) : family.name}</h3>
        <span>{[family.brand, family.system, family.depth ? ctx.fmt.mm(family.depth, { unit: true }) : undefined, family.chambers ? ctx.t('family.chambersValue', { count: family.chambers }) : undefined].filter(Boolean).join(' · ')}</span>
      </div>
      {showQr && !continued ? <RequestQr ctx={ctx} size={11} /> : null}
    </header>
  )
}

function sizeText(ctx: Ctx, p: ProductModel): string | undefined {
  const r = p.sashRange
  if (!r) return undefined
  const range = (a: number, b: number) => `${ctx.fmt.mm(a)}–${ctx.fmt.mm(b)}`
  return ctx.t('product.sizeSash', { w: range(r.minW, r.maxW), h: range(r.minH, r.maxH) })
}

function Card({ ctx, product, section, height, width }: { ctx: Ctx; product: ProductModel; section: Extract<BlockData, { kind: 'cards' }>['section']; height: number; width: number }) {
  const o = section.options
  const m = ctx.metrics
  const drawH = Math.min(width * 0.72, o.drawingSize === 'xs' ? 26 : o.drawingSize === 's' ? 36 : o.drawingSize === 'm' ? 50 : 64)
  const size = o.showSizeRange ? sizeText(ctx, product) : undefined
  return (
    <article className="dkc-card" style={{ width: mm(width), height: mm(height) }}>
      <div className="dkc-card__well" style={{ height: mm(drawH) }}>
        <span className="dkc-code dkc-card__code">{product.code}</span>
        <Drawing ctx={ctx} t={product.source} width={width - 8} height={drawH - 6} colorId={featureColor(product.family).colorId} title={product.name} />
      </div>
      <div className="dkc-card__body" style={{ padding: `${mm(Math.min(m.u, 4) * 0.75)} ${mm(Math.min(m.u, 4))}` }}>
        <h4 className="dkc-card__name">{product.name}</h4>
        {o.showOpening ? <p className="dkc-card__line">{product.opening}</p> : null}
        {size ? <p className="dkc-card__line dkc-num">{size}</p> : null}
        {o.showFromPrice ? <FromPrice ctx={ctx} value={product.fromPrice} className="dkc-card__price" /> : null}
      </div>
    </article>
  )
}

function Cards({ ctx, data }: { ctx: Ctx; data: Extract<BlockData, { kind: 'cards' }> }) {
  const m = ctx.metrics
  const cols = Math.max(2, data.section.options.columns)
  const width = (m.content.width - m.u * (cols - 1)) / cols
  return (
    <div className="dkc-cards" style={{ gap: mm(m.u) }}>
      {data.products.map((p) => (
        <Card key={p.key} ctx={ctx} product={p} section={data.section} height={data.cardHeight} width={width} />
      ))}
    </div>
  )
}

function ProductRow({ ctx, product, section, height }: { ctx: Ctx; product: ProductModel; section: Extract<BlockData, { kind: 'productRow' }>['section']; height: number }) {
  const o = section.options
  const drawW = height * 1.25
  const size = o.showSizeRange ? sizeText(ctx, product) : undefined
  return (
    <div className="dkc-prow">
      <div className="dkc-prow__drawing" style={{ width: mm(drawW), height: mm(height - 3) }}>
        <Drawing ctx={ctx} t={product.source} width={drawW - 2} height={height - 5} title={product.name} />
      </div>
      <span className="dkc-code dkc-prow__code">{product.code}</span>
      <div className="dkc-prow__main">
        <div className="dkc-prow__name">{product.name}</div>
        {o.showOpening ? <div className="dkc-prow__sub">{product.opening}</div> : null}
      </div>
      <div className="dkc-prow__size dkc-num">{size ?? ''}</div>
      {o.showFromPrice ? <FromPrice ctx={ctx} value={product.fromPrice} className="dkc-prow__price" /> : null}
    </div>
  )
}

function Lookbook({ ctx, data }: { ctx: Ctx; data: Extract<BlockData, { kind: 'lookbook' }> }) {
  const m = ctx.metrics
  const o = data.section.options
  const cols = data.products.length > 1 || o.columns === 2 ? 2 : 1
  const W = m.content.width
  const itemW = cols === 2 ? (W - m.u) / 2 : W
  const H = data.itemHeight
  return (
    <div className={cx('dkc-look', cols === 2 && 'dkc-look--cols')} style={{ gap: mm(m.u) }}>
      {data.products.map(({ product, offset }) => {
        const variant = o.showColorVariants ? variantColor(product, offset) : featureColor(product.family)
        const flip = cols === 1 && offset % 2 === 1
        const stageW = cols === 2 ? itemW : W * 0.6
        const stageH = cols === 2 ? H * 0.68 : H
        const size = o.showSizeRange ? sizeText(ctx, product) : undefined
        return (
          <article key={product.key} className={cx('dkc-look__item', flip && 'dkc-look__item--flip')} style={{ width: mm(itemW), height: mm(H) }}>
            <div className="dkc-look__stage" style={{ width: mm(stageW), height: mm(stageH) }}>
              <Drawing ctx={ctx} t={product.source} width={stageW - 16} height={stageH - 14} colorId={variant.colorId} dims={cols === 1 ? 'total' : 'none'} title={product.name} />
            </div>
            <div className="dkc-look__text">
              <div className="dkc-kicker">{[product.code, product.family.name].join(' · ')}</div>
              <h3 className="dkc-look__name">{product.name}</h3>
              {o.showOpening ? <p className="dkc-look__line">{product.opening}</p> : null}
              {size ? <p className="dkc-look__line dkc-num">{size}</p> : null}
              {o.showFromPrice ? <FromPrice ctx={ctx} value={product.fromPrice} long /> : null}
              {cols === 1 ? <SwatchRow ctx={ctx} finishes={product.family.colors} max={6} /> : null}
              {variant.name ? <p className="dkc-look__caption">{ctx.t('product.inImage', { color: variant.name })}</p> : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

// ── Matriz ───────────────────────────────────────────────────────────────────

function Matrix({ ctx, data }: { ctx: Ctx; data: Extract<BlockData, { kind: 'matrix' }> }) {
  const rows = matrixRows(data.section, ctx.model.families, ctx.model.hasPrices)
  const t = ctx.t
  const label: Record<string, string> = {
    openings: t('matrix.openings'),
    depth: t('matrix.depth'),
    glazing: t('matrix.glazing'),
    performance: t('matrix.performance'),
    max_size: t('matrix.maxSize'),
    finishes: t('matrix.finishes'),
    price_from: t('matrix.priceFrom'),
  }
  const cell = (row: string, f: FamilyModel): ReactNode => {
    switch (row) {
      case 'openings':
        return (
          <ul className="dkc-matrix__openings">
            {f.line.kind === 'sliding' ? <li>{f.system}</li> : null}
            {f.openings.filter((k) => k !== 'fixed').slice(0, 6).map((k) => (
              <li key={k}>{openingName(k, ctx.locale)}</li>
            ))}
          </ul>
        )
      case 'depth':
        return f.depth ? <span className="dkc-num">{ctx.fmt.mm(f.depth, { unit: true })}</span> : t('matrix.none')
      case 'glazing':
        return f.maxGlass ? <span className="dkc-num">{t('family.glazingRange', { max: ctx.fmt.mm(f.maxGlass) })}</span> : t('matrix.none')
      case 'max_size':
        return f.maxSash ? <span className="dkc-num">{ctx.fmt.size(f.maxSash.w, f.maxSash.h)}</span> : t('matrix.none')
      case 'finishes':
        return f.colors.length ? <SwatchRow ctx={ctx} finishes={f.colors} max={12} /> : t('matrix.none')
      case 'price_from':
        return <FromPrice ctx={ctx} value={f.fromPrice} />
      default:
        return t('matrix.none')
    }
  }
  return (
    <table className={cx('dkc-matrix', data.section.options.variant === 'comparison' && 'dkc-matrix--zebra')}>
      <thead>
        <tr>
          <th className="dkc-matrix__corner">{t('matrix.feature')}</th>
          {data.families.map((f) => (
            <th key={f.id}>
              <span className="dkc-badge">{f.letter}</span>
              <span className="dkc-matrix__name">{f.name}</span>
              <span className="dkc-matrix__brand">{[f.brand, f.system].filter(Boolean).join(' · ')}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row} style={{ height: mm(data.rowHeights[i] ?? 8) }}>
            <th scope="row">{label[row]}</th>
            {data.families.map((f) => (
              <td key={f.id}>{cell(row, f)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Terminaciones, vidrios y herrajes ────────────────────────────────────────

function finishLabel(ctx: Ctx, f: FinishModel): string | undefined {
  return f.finish ? glossaryTerm(`finish.${f.finish}` as never, ctx.locale) : undefined
}

function Swatches({ ctx, data, height }: { ctx: Ctx; data: Extract<BlockData, { kind: 'swatches' }>; height: number }) {
  const m = ctx.metrics
  const o = data.section.options
  const boards = o.variant === 'boards'
  const colW = (m.content.width - m.u * (data.perRow - 1)) / data.perRow
  const swH = colW * (boards ? 0.78 : 0.62)
  return (
    <div className={cx('dkc-swatches', boards && 'dkc-swatches--boards')} style={{ gap: mm(m.u), height: mm(height - m.u) }}>
      {data.finishes.map((f) => (
        <figure key={f.id} className="dkc-sw" style={{ width: mm(colW) }}>
          <div style={{ height: mm(swH) }}>
            <Swatch ctx={ctx} finish={f} />
          </div>
          <figcaption>
            <span className="dkc-sw__name">{f.name}</span>
            <span className="dkc-sw__meta">
              {[o.showCodes && f.code ? ctx.t('finishes.code', { code: f.code }) : undefined, o.showTextures ? finishLabel(ctx, f) : undefined].filter(Boolean).join(' · ')}
            </span>
            {boards && f.lines.length ? (
              <span className="dkc-sw__meta">{f.lines.length >= ctx.model.families.length && ctx.model.families.length > 1 ? ctx.t('finishes.allLines') : ctx.t('finishes.lines', { lines: ctx.fmt.list(f.lines) })}</span>
            ) : null}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

function Pairs({ ctx, data }: { ctx: Ctx; data: Extract<BlockData, { kind: 'pairs' }> }) {
  const m = ctx.metrics
  const colW = (m.content.width - m.u) / 2
  const white = ctx.model.finishes.find((f) => /^(white|blanco)|9016/i.test(`${f.id} ${f.name} ${f.code ?? ''}`)) ?? ctx.model.finishes.find((f) => f.hex && parseInt(f.hex.slice(1, 3), 16) > 235)
  return (
    <div className="dkc-pairs" style={{ gap: mm(m.u) }}>
      {data.finishes.map((f) => {
        const inside = white && white.id !== f.id && f.finish === 'woodgrain' ? white : f
        return (
          <figure key={f.id} className="dkc-pair" style={{ width: mm(colW) }}>
            <div className="dkc-pair__tiles" style={{ height: mm(colW * 0.46) }}>
              <div className="dkc-pair__tile">
                <Swatch ctx={ctx} finish={f} />
                <span className="dkc-pair__side">{ctx.t('finishes.exterior')}</span>
              </div>
              <div className="dkc-pair__tile">
                <Swatch ctx={ctx} finish={inside} />
                <span className="dkc-pair__side">{ctx.t('finishes.interior')}</span>
              </div>
            </div>
            <figcaption>
              <span className="dkc-sw__name">{f.name}</span>
              <span className="dkc-sw__meta">
                {[inside.id === f.id ? ctx.t('finishes.sameBoth') : ctx.t('finishes.whiteInside'), data.section.options.showCodes && f.code ? ctx.t('finishes.code', { code: f.code }) : undefined, finishLabel(ctx, f)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}

function LayersGlyph({ glass }: { glass: GlassModel }) {
  const layers = glass.layers.length ? glass.layers : [{ kind: 'pane' as const, mm: glass.thickness ?? 4 }]
  return (
    <svg className="dkc-layers-glyph" viewBox="0 0 24 24" aria-hidden="true">
      {layers.map((l, i) =>
        l.kind === 'pane' ? <rect key={i} x={4 + i * 6} y="3" width="3" height="18" fill="currentColor" opacity="0.75" /> : <rect key={i} x={4 + i * 6} y="3" width="3" height="18" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="1.2 1" />,
      )}
    </svg>
  )
}

function GlassList({ ctx, data }: { ctx: Ctx; data: Extract<BlockData, { kind: 'glassList' }> }) {
  return (
    <ul className="dkc-glass">
      {data.glass.map((g) => (
        <li key={g.id} className="dkc-glass__row" style={{ height: mm(data.rowHeight) }}>
          <LayersGlyph glass={g} />
          <div className="dkc-glass__main">
            <div className="dkc-glass__name">
              {g.name}
              {g.base ? <span className="dkc-tag">{ctx.t('glass.base')}</span> : null}
            </div>
            <div className="dkc-glass__sub">{[g.kindLabel, g.composition].filter(Boolean).join(' · ')}</div>
          </div>
          {g.thickness ? <div className="dkc-glass__mm dkc-num">{ctx.t('glass.thickness', { mm: ctx.fmt.mm(g.thickness) })}</div> : null}
        </li>
      ))}
    </ul>
  )
}

function GlassLayers({ ctx, data }: { ctx: Ctx; data: Extract<BlockData, { kind: 'glassLayers' }> }) {
  const m = ctx.metrics
  const colW = (m.content.width - m.u) / 2
  return (
    <div className="dkc-glasscards" style={{ gap: mm(m.u) }}>
      {data.glass.map((g) => {
        const total = g.layers.reduce((s, l) => s + l.mm, 0) || g.thickness || 1
        const scale = Math.min(2.6, 30 / total)
        let x = 4
        return (
          <article key={g.id} className="dkc-glasscard" style={{ width: mm(colW) }}>
            <svg className="dkc-glasscard__section" viewBox="0 0 60 40" aria-hidden="true">
              {g.layers.map((l, i) => {
                const w = Math.max(1.2, l.mm * scale)
                const el =
                  l.kind === 'pane' ? (
                    <g key={i}>
                      <rect x={x} y={4} width={w} height={28} fill="var(--c-glass)" stroke="currentColor" strokeWidth="0.35" />
                      <text x={x + w / 2} y={37.5} textAnchor="middle" fontSize="3.2" fill="currentColor">{ctx.fmt.mm(l.mm)}</text>
                    </g>
                  ) : (
                    <g key={i}>
                      <rect x={x} y={4} width={w} height={28} fill="none" stroke="currentColor" strokeWidth="0.25" strokeDasharray="0.8 0.8" />
                      <rect x={x} y={30} width={w} height={2} fill="currentColor" opacity="0.5" />
                      <text x={x + w / 2} y={37.5} textAnchor="middle" fontSize="3.2" fill="currentColor" opacity="0.75">{ctx.fmt.mm(l.mm)}</text>
                    </g>
                  )
                x += w
                return el
              })}
            </svg>
            <div className="dkc-glasscard__text">
              <div className="dkc-glass__name">{g.name}</div>
              <div className="dkc-glass__sub">{g.kindLabel}</div>
              {g.thickness ? <div className="dkc-glass__sub dkc-num">{ctx.t('glass.thickness', { mm: ctx.fmt.mm(g.thickness) })}</div> : null}
              {g.base ? <span className="dkc-tag">{ctx.t('glass.base')}</span> : null}
            </div>
          </article>
        )
      })}
      <p className="dkc-note dkc-glasscards__note">{ctx.t('glass.layersNote')}</p>
    </div>
  )
}

function HandleGlyph() {
  return (
    <svg className="dkc-hw-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="3" width="6" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M11 8.5h9a1.5 1.5 0 0 1 0 3h-9" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function Hardware({ ctx, data }: { ctx: Ctx; data: Extract<BlockData, { kind: 'hardware' }> }) {
  const m = ctx.metrics
  const o = data.section.options
  const list = o.variant === 'list'
  const colW = list ? m.content.width : (m.content.width - m.u * (data.perRow - 1)) / data.perRow
  return (
    <ul className={cx('dkc-hw', list && 'dkc-hw--list')} style={{ gap: list ? 0 : mm(m.u) }}>
      {data.items.map((item: HardwareModel) => (
        <li key={item.id} className="dkc-hw__item" style={{ width: mm(colW), height: mm(data.itemHeight) }}>
          <HandleGlyph />
          <div className="dkc-hw__main">
            <div className="dkc-hw__name">{item.name}</div>
            <div className="dkc-hw__sub">
              {[o.showCodes ? ctx.t('hardware.code', { code: item.code }) : undefined, item.openings.length ? ctx.t('hardware.openings', { openings: ctx.fmt.list(item.openings.slice(0, 4)) }) : undefined]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {o.showFinishes && item.finishes.length ? <div className="dkc-hw__sub">{ctx.t('hardware.finishes', { colors: ctx.fmt.list(item.finishes.slice(0, 5)) })}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── Contacto, imágenes y notas ───────────────────────────────────────────────

function Contact({ ctx, data, height }: { ctx: Ctx; data: Extract<BlockData, { kind: 'contact' }>; height: number }) {
  const org = ctx.data.org
  const o = data.section.options
  const t = ctx.t
  const web = safeWebUrl(org.website)
  const rows: { label: string; value: string }[] = []
  if (org.phone) rows.push({ label: t('contact.phone'), value: org.phone })
  if (org.email) rows.push({ label: t('contact.email'), value: org.email })
  if (o.showWebsite && web) rows.push({ label: t('contact.website'), value: displayUrl(web) ?? '' })
  if (o.showAddress && (org.address || org.city)) rows.push({ label: t('contact.address'), value: [org.address, org.city].filter(Boolean).join(', ') })
  const qr = o.showQr ? <RequestQr ctx={ctx} size={data.large ? 44 : o.variant === 'qr' ? 34 : o.variant === 'band' ? 24 : 28} caption={t('contact.scan')} /> : null
  return (
    <div className={cx('dkc-contact', `dkc-contact--${o.variant}`, data.large && 'dkc-contact--large')} style={{ height: mm(height - ctx.metrics.u * 0.5) }}>
      <div className="dkc-contact__main">
        <div className="dkc-contact__brand">
          <OrgLogo org={org} />
          <div>
            {org.logo ? <div className="dkc-contact__org">{org.name}</div> : null}
            {org.legalName && org.legalName !== org.name ? <div className="dkc-contact__legal">{[org.legalName, org.rut].filter(Boolean).join(' · ')}</div> : null}
          </div>
        </div>
        <p className="dkc-contact__lead">{t('contact.lead')}</p>
        <dl className="dkc-contact__rows">
          {rows.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {qr}
    </div>
  )
}

function Gallery({ ctx, data }: { ctx: Ctx; data: Extract<BlockData, { kind: 'gallery' }> }) {
  const m = ctx.metrics
  const cols = data.section.options.variant === 'hero' ? 1 : data.section.options.variant === 'before_after' ? 2 : Math.max(2, data.section.options.columns)
  const colW = (m.content.width - m.u * (cols - 1)) / cols
  return (
    <div className="dkc-gallery" style={{ gap: mm(m.u) }}>
      {data.images.map((img, i) => (
        <figure key={i} className="dkc-gallery__item" style={{ width: mm(colW) }}>
          <img className="dkc-img" src={img.src} alt={img.alt ?? img.caption ?? ''} style={{ height: mm(data.imageHeight) }} />
          {img.caption ? <figcaption className="dkc-caption">{img.caption}</figcaption> : null}
        </figure>
      ))}
    </div>
  )
}

/** Dibuja un bloque dentro de su caja de alto fijo. */
export function BlockView({ ctx, block }: { ctx: Ctx; block: Block }) {
  const data = block.data
  const style: CSSProperties = { height: mm(block.height), ...(block.gapBefore ? { marginTop: mm(block.gapBefore) } : {}) }
  let body: ReactNode
  switch (data.kind) {
    case 'heading':
      body = <Heading data={data} {...(ctx.onSectionEdit ? { onTitle: (value: string) => ctx.onSectionEdit?.(block.sectionId, 'title', value) } : {})} />
      break
    case 'toc':
      body = <Toc ctx={ctx} entries={data.entries} />
      break
    case 'tocFamilies':
      body = <TocFamilies ctx={ctx} families={data.families} height={block.height} />
      break
    case 'guideSteps':
      body = <GuideSteps ctx={ctx} height={data.stepHeight} />
      break
    case 'guideOpenings':
      body = <GuideOpenings ctx={ctx} />
      break
    case 'note':
      body = <p className="dkc-note">{data.text}</p>
      break
    case 'priceNote':
      body = <p className="dkc-note">{ctx.t('price.note', { tax: ctx.tax })}</p>
      break
    case 'rich':
      body = (
        <div className={cx('dkc-rich', data.columns === 2 && 'dkc-rich--cols', data.callout && 'dkc-rich--callout')}>
          <RichBlockView ctx={ctx} block={data.block} />
        </div>
      )
      break
    case 'familyLifestyle':
      body = <FamilyLifestyle ctx={ctx} family={data.family} section={data.section} />
      break
    case 'familySheet':
      body = <FamilySheet ctx={ctx} family={data.family} section={data.section} />
      break
    case 'familyTiles':
      body = <FamilyTiles ctx={ctx} families={data.families} section={data.section} />
      break
    case 'chapter':
      body = <Chapter ctx={ctx} family={data.family} continued={data.continued} showQr={data.qr} />
      break
    case 'cards':
      body = <Cards ctx={ctx} data={data} />
      break
    case 'productRow':
      body = <ProductRow ctx={ctx} product={data.product} section={data.section} height={block.height} />
      break
    case 'lookbook':
      body = <Lookbook ctx={ctx} data={data} />
      break
    case 'matrix':
      body = <Matrix ctx={ctx} data={data} />
      break
    case 'swatches':
      body = <Swatches ctx={ctx} data={data} height={block.height} />
      break
    case 'pairs':
      body = <Pairs ctx={ctx} data={data} />
      break
    case 'glassList':
      body = <GlassList ctx={ctx} data={data} />
      break
    case 'glassLayers':
      body = <GlassLayers ctx={ctx} data={data} />
      break
    case 'hardware':
      body = <Hardware ctx={ctx} data={data} />
      break
    case 'contact':
      body = <Contact ctx={ctx} data={data} height={block.height} />
      break
    case 'aboutImage':
      body = <img className="dkc-img dkc-about__img" src={data.src} alt={data.alt ?? ''} style={{ height: mm(block.height - ctx.metrics.u) }} />
      break
    case 'gallery':
      body = <Gallery ctx={ctx} data={data} />
      break
    case 'cover':
      body = null
      break
  }
  return (
    <div className={cx('dkc-block', `dkc-block--${data.kind}`, toneClass(block.tone))} style={style} data-section={block.sectionId}>
      {body}
    </div>
  )
}

/** Alto aproximado de una línea de texto chica (lo usan cabeceras de página). */
export function smallLine(ctx: Ctx): number {
  return lineMm(ctx.metrics.type.small, 1.3)
}

export { Chapter }
