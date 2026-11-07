/**
 * Portadas del catálogo (página completa, sin márgenes de flujo): tipográfica, dibujo, foto, partida
 * y alzado. Una portada con foto pero sin foto subida usa el dibujo de la ventana más representativa
 * (nunca un hueco ni un aviso impreso).
 */
import type { CSSProperties } from 'react'
import type { DocSectionOf } from '@dekopen/shared'
import type { FamilyModel, ProductModel } from './model'
import { Drawing, OrgLogo, Swatch, contactParts, type CatalogRenderContext } from './parts'
import { fillText } from './blocks'

type Ctx = CatalogRenderContext
type CoverSection = DocSectionOf<'cover'>

function mm(n: number): string {
  return `${Math.round(n * 100) / 100}mm`
}

/** Producto más vistoso del catálogo (el más grande entre los que abren). */
function heroProduct(ctx: Ctx): ProductModel | undefined {
  const heroes = ctx.model.families.map((f) => f.hero).filter((p): p is ProductModel => !!p)
  return [...heroes].sort((a, b) => b.area - a.area)[0] ?? ctx.model.products[0]
}

function featureColorOf(family: FamilyModel | undefined): string | undefined {
  if (!family) return undefined
  return (family.colors.find((c) => c.finish === 'woodgrain') ?? family.colors[0])?.id
}

/** Hasta `max` productos distintos para un alzado (uno por familia y después el resto). */
function lineupProducts(ctx: Ctx, max: number): ProductModel[] {
  const out: ProductModel[] = []
  const seen = new Set<string>()
  for (const f of ctx.model.families) {
    const p = f.hero ?? f.products[0]
    if (p && !seen.has(p.typologyId)) {
      out.push(p)
      seen.add(p.typologyId)
    }
  }
  for (const p of ctx.model.products) {
    if (out.length >= max) break
    if (!seen.has(p.typologyId)) {
      out.push(p)
      seen.add(p.typologyId)
    }
  }
  return out.slice(0, max)
}

/** Escala común de un alzado (mm de papel por mm de ventana) que cabe en `width` × `height`. */
function lineupScale(products: ProductModel[], width: number, height: number, gap: number): number {
  const sumW = products.reduce((s, p) => s + p.source.design.width, 0)
  const maxH = products.reduce((s, p) => Math.max(s, p.source.design.height), 1)
  const free = width - gap * Math.max(0, products.length - 1) - 2 * products.length
  return Math.max(0.001, Math.min(free / Math.max(1, sumW), (height - 2) / maxH))
}

/** Alto real que ocupa un alzado a su escala (para dimensionar el escenario). */
function lineupHeight(products: ProductModel[], width: number, height: number): number {
  if (!products.length) return 0
  const gap = Math.max(6, width * 0.04)
  const scale = lineupScale(products, width, height, gap)
  return products.reduce((s, p) => Math.max(s, p.source.design.height), 1) * scale + 2
}

/** Fila de dibujos a la misma escala, apoyados en una línea de piso común. */
function Lineup({ ctx, products, width, height, colored }: { ctx: Ctx; products: ProductModel[]; width: number; height: number; colored: boolean }) {
  if (!products.length) return null
  const gap = Math.max(6, width * 0.04)
  const scale = lineupScale(products, width, height, gap)
  return (
    <div className="dkc-lineup" style={{ gap: mm(gap), height: mm(height) }}>
      {products.map((p) => (
        <div key={p.key} className="dkc-lineup__item" style={{ width: mm(p.source.design.width * scale + 2), height: mm(p.source.design.height * scale + 2) }}>
          <Drawing ctx={ctx} t={p.source} width={p.source.design.width * scale + 2} height={p.source.design.height * scale + 2} colorId={colored ? featureColorOf(p.family) : undefined} title={p.name} plain />
        </div>
      ))}
    </div>
  )
}

/** Datos clave de la portada: líneas, diseños y colores (cifras del catálogo, nunca inventadas). */
function Facts({ ctx }: { ctx: Ctx }) {
  const t = ctx.t
  const items = [
    { key: 'families', count: ctx.model.families.length, label: t('document.familiesNoun', { count: ctx.model.families.length }) },
    { key: 'products', count: ctx.model.products.length, label: t('document.productsNoun', { count: ctx.model.products.length }) },
    { key: 'finishes', count: ctx.model.finishes.length, label: t('document.finishesNoun', { count: ctx.model.finishes.length }) },
  ].filter((f) => f.count > 0)
  return (
    <ul className="dkc-cover__facts" aria-label={t('cover.facts')}>
      {items.map((f) => (
        <li key={f.key}>
          <span className="dkc-cover__fact-value">{ctx.fmt.number(f.count)}</span>
          <span className="dkc-cover__fact-label">{f.label}</span>
        </li>
      ))}
    </ul>
  )
}

/** Índice de líneas de la portada (letra + nombre + diseños). */
function FamilyIndex({ ctx, max = 8 }: { ctx: Ctx; max?: number }) {
  if (!ctx.model.families.length) return null
  return (
    <ol className="dkc-cover__index">
      {ctx.model.families.slice(0, max).map((f) => (
        <li key={f.id}>
          <span className="dkc-badge">{f.letter}</span>
          <span className="dkc-cover__index-name">{f.name}</span>
          <span className="dkc-cover__index-meta">{ctx.t('document.products', { count: f.products.length })}</span>
        </li>
      ))}
    </ol>
  )
}

function Brand({ ctx, contact = true }: { ctx: Ctx; contact?: boolean }) {
  const org = ctx.data.org
  const lines = contact ? contactParts(org) : []
  return (
    <div className="dkc-cover__brand">
      <OrgLogo org={org} />
      <div>
        {org.logo ? <div className="dkc-cover__org">{org.name}</div> : null}
        {lines.length ? <div className="dkc-cover__contact">{lines.join(' · ')}</div> : null}
      </div>
    </div>
  )
}

function Titles({ ctx, section, size = 'display' }: { ctx: Ctx; section: CoverSection; size?: 'display' | 'h1' }) {
  const title = section.options.title ? fillText(ctx, section.options.title) : ctx.title
  const subtitle = section.options.subtitle ? fillText(ctx, section.options.subtitle) : ctx.t('document.lead')
  const long = title.length > 34
  return (
    <div className="dkc-cover__titles">
      <div className="dkc-kicker">{ctx.edition ? ctx.t('document.edition', { date: ctx.edition }) : ctx.t('document.kicker')}</div>
      <h1 className={`dkc-cover__title dkc-cover__title--${size}${long ? ' dkc-cover__title--long' : ''}`}>{title}</h1>
      <p className="dkc-cover__lead">{subtitle}</p>
    </div>
  )
}

/** Portada a página completa. */
export function Cover({ ctx, section }: { ctx: Ctx; section: CoverSection }) {
  const m = ctx.metrics
  const W = m.page.width
  const H = m.page.height
  const pad = { top: m.margin.top, right: m.margin.right, bottom: m.margin.bottom, left: m.margin.left }
  const o = section.options
  const hero = heroProduct(ctx)
  const photo = o.variant === 'photo' || o.variant === 'split' ? ctx.asset(o.assetId) : undefined
  const tone = section.tone === 'paper' ? '' : ` dkc-tone dkc-tone--${section.tone}`
  const inner: CSSProperties = { position: 'absolute', top: mm(pad.top), right: mm(pad.right), bottom: mm(pad.bottom), left: mm(pad.left) }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  if (o.variant === 'typographic') {
    const band = 9
    const lineup = lineupProducts(ctx, 5)
    const keyW = innerW - band
    return (
      <div className={`dkc-cover dkc-cover--typographic${tone}`}>
        <div className="dkc-cover__band" style={{ width: mm(band) }} />
        <div style={{ ...inner, left: mm(pad.left + band) }} className="dkc-cover__inner">
          {o.showLogo ? <Brand ctx={ctx} /> : <div />}
          <div className="dkc-cover__gap" style={{ height: mm(innerH * 0.12) }} />
          <Titles ctx={ctx} section={section} />
          {/* Título arriba y fachada abajo: las ventanas se apoyan sobre el índice, no flotan a media hoja. */}
          <div className="dkc-cover__spacer" />
          <div className="dkc-cover__key">
            <Lineup ctx={ctx} products={lineup} width={keyW} height={Math.min(lineupHeight(lineup, keyW, Math.min(56, innerH * 0.22)), 56)} colored={false} />
          </div>
          <div className="dkc-cover__rule" />
          <FamilyIndex ctx={ctx} />
          {o.showFacts ? <Facts ctx={ctx} /> : null}
        </div>
      </div>
    )
  }

  if (o.variant === 'split') {
    const half = W * 0.46
    const tiles = ctx.model.finishes.slice(0, 6)
    // Mosaico parejo: con un número impar, la última muestra ocupa el ancho completo.
    const odd = tiles.length % 2 === 1 && tiles.length > 1
    return (
      <div className={`dkc-cover dkc-cover--split${tone}`}>
        <div className="dkc-cover__mosaic" style={{ width: mm(half) }}>
          {photo ? (
            <img className="dkc-img dkc-cover__photo" src={photo} alt="" />
          ) : tiles.length ? (
            tiles.map((f, i) => (
              <div key={f.id} className={odd && i === tiles.length - 1 ? 'dkc-cover__tile dkc-cover__tile--wide' : 'dkc-cover__tile'}>
                <Swatch ctx={ctx} finish={f} />
                <span className="dkc-cover__tile-name">{f.name}</span>
              </div>
            ))
          ) : hero ? (
            <div className="dkc-cover__mosaic-hero">
              <Drawing ctx={ctx} t={hero.source} width={half - 20} height={H * 0.5} colorId={featureColorOf(hero.family)} title={hero.name} />
            </div>
          ) : null}
        </div>
        <div className="dkc-cover__inner" style={{ ...inner, left: mm(half + m.u * 2.5) }}>
          {o.showLogo ? <Brand ctx={ctx} contact={false} /> : <div />}
          <div className="dkc-cover__spacer" />
          <Titles ctx={ctx} section={section} size="h1" />
          <div className="dkc-cover__spacer" />
          {o.showFacts ? <Facts ctx={ctx} /> : null}
        </div>
      </div>
    )
  }

  if (o.variant === 'elevation') {
    const lineup = lineupProducts(ctx, 4)
    const maxStage = innerH * 0.46
    const stageW = innerW - 16
    const natural = lineupHeight(lineup, stageW, maxStage - 18)
    const stageH = Math.max(innerH * 0.24, Math.min(maxStage, natural + 18))
    return (
      <div className={`dkc-cover dkc-cover--elevation${tone}`}>
        <div className="dkc-cover__inner" style={inner}>
          <div className="dkc-cover__top">
            {o.showLogo ? <Brand ctx={ctx} /> : <div />}
          </div>
          <Titles ctx={ctx} section={section} size="h1" />
          {/* El escenario abraza a las ventanas, paradas sobre su piso; el aire queda sobre él, no dentro. */}
          <div className="dkc-cover__spacer" />
          <div className="dkc-cover__stage" style={{ minHeight: mm(stageH) }}>
            <Lineup ctx={ctx} products={lineup} width={stageW} height={natural} colored />
            <div className="dkc-cover__ground" />
          </div>
          <FamilyIndex ctx={ctx} />
          {o.showFacts ? <Facts ctx={ctx} /> : null}
        </div>
      </div>
    )
  }

  // photo y drawing: escenario grande arriba (foto o dibujo sobre un muro), títulos abajo.
  const stageH = H * (o.variant === 'photo' ? 0.6 : 0.5)
  return (
    <div className={`dkc-cover dkc-cover--${o.variant === 'photo' ? 'photo' : 'drawing'}${tone}`}>
      <div className="dkc-cover__hero" style={{ height: mm(stageH) }}>
        {photo ? (
          <img className="dkc-img dkc-cover__photo" src={photo} alt="" />
        ) : hero ? (
          <div className="dkc-cover__wall">
            <Drawing ctx={ctx} t={hero.source} width={W * 0.62} height={stageH - 34} colorId={featureColorOf(hero.family)} title={hero.name} plain />
            <div className="dkc-cover__sill" />
          </div>
        ) : null}
        {o.showLogo ? (
          <div className="dkc-cover__hero-brand" style={{ top: mm(pad.top), left: mm(pad.left) }}>
            <OrgLogo org={ctx.data.org} />
            {ctx.data.org.logo ? <span className="dkc-cover__org">{ctx.data.org.name}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="dkc-cover__inner" style={{ ...inner, top: mm(stageH + m.u * 2.5) }}>
        <Titles ctx={ctx} section={section} size="h1" />
        <div className="dkc-cover__spacer" />
        {o.showFacts ? <Facts ctx={ctx} /> : null}
        {o.showLogo ? <div className="dkc-cover__contact dkc-cover__contact--foot">{contactParts(ctx.data.org).join(' · ')}</div> : null}
      </div>
    </div>
  )
}
