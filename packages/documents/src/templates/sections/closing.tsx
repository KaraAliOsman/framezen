/**
 * Cierre y textos: condiciones (`terms`), garantía (`warranty`), aceptación con QR al portal
 * (`acceptance`), quiénes somos (`about_us`), galería de fotos (`gallery`), texto libre
 * (`custom_text`) y salto de página (`page_break`). Los textos largos se parten por párrafo para fluir
 * entre hojas; en la vista previa editable cada texto queda entero para editarlo en el lugar.
 */
import type { ReactNode } from 'react'
import { richTextToSource, type DocSectionOf, type RichBlock } from '@dekopen/shared'
import { clsx } from '../../base/clsx'
import { EditableText } from '../../base/editable'
import type { QuoteDocField } from '../../sales/types'
import type { QuoteModel } from '../model'
import { DocText, Ghost, Label, OrgLogo, QrCode, RichBlocks, richOf, TextChunk } from '../parts'
import { isQrValue } from '../qr'
import { chunkRichBlocks, lineCount, richTextHeight } from '../measure'
import { headingNode, lineH, sectionBlocks, textMetrics, type SectionRenderer } from './common'

// ── Condiciones ─────────────────────────────────────────────────────────────

/** Con una sola ventana, garantía en texto y condiciones a dos columnas: caben en la hoja de la ventana. */
function compactLegal(m: QuoteModel): boolean {
  return m.items.length === 1 && !m.tokens.composition.sideHeadings
}

interface Term {
  key: string
  title: string
  field?: QuoteDocField
  text: string
  /** Texto ya armado (vigencia). */
  fixed?: ReactNode
  /** Guía del editor cuando el taller aún no lo escribe. */
  ghost?: string
}

function termsOf(m: QuoteModel, blocks: readonly string[]): Term[] {
  const { t, fmt } = m.kit
  const out: Term[] = []
  const shown = (text: string) => !!text || m.editable
  for (const key of blocks) {
    if (key === 'includes' && shown(m.texts.includes)) out.push({ key, title: t('terms.includes'), field: 'includes', text: m.texts.includes })
    if (key === 'excludes' && shown(m.texts.excludes)) out.push({ key, title: t('terms.excludes'), field: 'excludes', text: m.texts.excludes })
    if (key === 'conditions' && (shown(m.texts.conditions) || m.ghost)) out.push({ key, title: t('terms.conditions'), field: 'conditions', text: m.texts.conditions, ghost: t('ghost.conditions') })
    if (key === 'lead_time' && (shown(m.texts.leadTimeText) || m.ghost)) out.push({ key, title: t('terms.leadTime'), field: 'leadTimeText', text: m.texts.leadTimeText, ghost: t('ghost.leadTime') })
    if (key === 'validity' && (m.validUntil || m.editable || m.ghost)) {
      const text = m.validUntil ? (m.validityDays > 0 ? t('terms.validityText', { days: m.validityDays, date: fmt.date(m.validUntil, 'long') }) : t('terms.validityUntil', { date: fmt.date(m.validUntil, 'long') })) : ''
      out.push({
        key,
        title: t('terms.validity'),
        text,
        ghost: t('ghost.validity'),
        // La frase se imprime tal cual; los días se cambian desde ella (el lienzo la abre al hacer clic).
        fixed: !m.canEdit('validityDays') ? undefined : text ? (
          <p data-field="validityDays" data-dk-text="">{text}</p>
        ) : (
          <p className="dkd-guide">
            <EditableText as="span" inline value="" field="validityDays" editable onChange={(v) => m.onEdit?.('validityDays', v)} className="dkd-num" placeholder={t('terms.validityPlaceholder')} />
          </p>
        ),
      })
    }
    if (key === 'notes' && shown(m.texts.clientNote)) out.push({ key, title: t('terms.notes'), field: 'notes', text: m.texts.clientNote })
  }
  return out
}

export const renderTerms: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'terms'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const terms = termsOf(m, o.blocks)
  if (terms.length === 0) return b.list
  const tm = textMetrics(m)
  const W = m.page.contentWidth
  const compact = o.variant === 'compact'
  const cols = o.variant === 'numbered' ? (compactLegal(m) ? 2 : o.columns) : o.columns === 2 || compact ? 2 : 1
  const colGap = 28
  const colW = cols === 2 ? (W - colGap) / 2 : W
  const metric = compact ? tm.small : { ...tm.body, size: tm.small.size * 1.05 }
  const titleH = lineH(tm.body) + 3
  const head = headingNode(section, m, ctx, { guide: terms.every((x) => !x.text && !x.fixed) })
  b.add('head', head.node, head.height, { keepWithNext: true })
  const numbered = o.variant === 'numbered'

  const termNode = (term: Term, chunks: RichBlock[][] | null, index: number, n: number, cont: boolean) => (
    <section className={clsx('dkd-term', !term.text && !term.fixed && 'dkd-guide')} data-dk-el={`block:${term.key}`}>
      {!cont ? (
        <h3 className="dkd-term__title">
          {numbered ? <span className="dkd-term__n dkd-num">{n}.</span> : null}
          {term.title}
        </h3>
      ) : null}
      <div className="dkd-term__body">
        {term.fixed ?? (!term.text && m.ghost && !m.editable ? <Ghost>{term.ghost}</Ghost> : chunks ? <TextChunk chunks={chunks} index={index} values={m.placeholders} editable={!!term.field && m.canEdit(term.field)} onChange={(v) => term.field && m.onEdit?.(term.field, v)} field={term.field} /> : term.field ? <DocText m={m} field={term.field} value={term.text} placeholder={term.title} /> : <p>{term.text}</p>)}
      </div>
    </section>
  )

  // Partes: cada término (o tramo de un término largo) con su alto estimado.
  const parts: { node: ReactNode; height: number }[] = []
  terms.forEach((term, i) => {
    if (term.fixed || !term.text) {
      parts.push({ node: termNode(term, null, 0, i + 1, false), height: titleH + Math.max(lineH(metric), richTextHeight(richOf(term.text || ' '), colW, metric, m.placeholders)) + 12 })
      return
    }
    const chunks = chunkRichBlocks(richOf(term.text).blocks, colW, metric, m.page.bodyHeight * 0.38, m.placeholders)
    chunks.forEach((blocks, j) => parts.push({ node: termNode(term, chunks, j, i + 1, j > 0), height: (j === 0 ? titleH : 0) + richTextHeight({ blocks }, colW, metric, m.placeholders) + 12 }))
  })

  if (cols === 1) {
    parts.forEach((p, i) => b.add(`t${i}`, <div className={clsx('dkd-terms', `dkd-terms--${o.variant}`)}>{p.node}</div>, p.height, { space: i === 0 ? undefined : 2 }))
    return b.list
  }
  // Dos columnas: paquetes de partes que se reparten en columnas equilibradas dentro de cada bloque.
  const maxBlock = m.page.bodyHeight * 0.55
  let pack: typeof parts = []
  let sum = 0
  let n = 0
  const flush = () => {
    if (!pack.length) return
    const tallest = Math.max(...pack.map((p) => p.height))
    const height = Math.ceil(Math.max(tallest, sum / 2 + tallest * 0.5))
    b.add(`t${n++}`, <div className={clsx('dkd-terms', `dkd-terms--${o.variant}`, 'dkd-terms--cols', compactLegal(m) && 'dkd-terms--tight')}>{pack.map((p, i) => <div key={i} className="dkd-terms__part">{p.node}</div>)}</div>, height, { space: n === 1 ? undefined : 4 })
    pack = []
    sum = 0
  }
  for (const p of parts) {
    if (pack.length && (sum + p.height) / 2 > maxBlock) flush()
    pack.push(p)
    sum += p.height
  }
  flush()
  return b.list
}

// ── Garantía ────────────────────────────────────────────────────────────────

const UNIT = /(años?|anos?|years?|ans?|jahre?n?|anni|anno|yıl|meses|mes|months?|mois|monate?n?|mesi|mese|ay)/i
// El componente llega hasta la puntuación o hasta el conector que abre otro plazo («…perfiles y termopaneles, y de 1 año…»).
const ROW_RE = new RegExp(String.raw`(\d{1,3})\s*${UNIT.source}\s+(?:de\s+garant[ií]a\s+)?(?:en|para|on|for|sur|pour|auf|für|su|per|em|nos?|nas?|de|del|da|do|des|du)?\s*([^,;.\d]+?)(?=\s*(?:[,;.]|\b(?:y|e|and|et|und|ed|ve)\b\s*(?:de\s+|of\s+)?\d|$))`, 'gi')

/** Lee «5 años en perfiles…, 1 año en herrajes…» como filas (componente, cobertura). Nada si no calza. */
export function parseWarranty(text: string): { rows: { component: string; years?: number; months?: number }[]; rest: string } | null {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean || clean.length > 600) return null
  const rows: { component: string; years?: number; months?: number }[] = []
  let covered = clean
  for (const m of clean.matchAll(ROW_RE)) {
    const count = Number(m[1])
    const unit = m[2].toLowerCase()
    const component = m[3].replace(/^(?:la|el|los|las|the|a|o|os|as|le|les|der|die|das|il|lo|gli)\s+/i, '').trim()
    if (!component || component.length > 90 || !Number.isFinite(count)) continue
    const months = /^(mes|meses|month|months|mois|monat|monate|monaten|mesi|mese|ay)$/i.test(unit)
    rows.push({ component: component.charAt(0).toUpperCase() + component.slice(1), ...(months ? { months: count } : { years: count }) })
    covered = covered.replace(m[0], ' ')
  }
  if (rows.length < 2) return null
  const rest = covered
    .replace(/^(?:\s*(?:garant[ií]a|warranty|garantia|garantie|gewährleistung|garanzia|garanti)\s*(?:de|of|von|di)?\s*)/i, '')
    .replace(/(?:^|\s)(?:y|e|and|et|und|ed|ve)(?:\s+de)?\s*(?=[,.\s]|$)/gi, ' ')
    .replace(/^[\s,;.:]+|[\s,;:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (/\d/.test(rest)) return null
  return { rows, rest: rest.length > 2 ? rest.charAt(0).toUpperCase() + rest.slice(1).replace(/\.?$/, '.') : '' }
}

export const renderWarranty: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'warranty'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const { t } = m.kit
  const text = m.texts.warranty
  if (!text && !m.editable && !m.ghost) return b.list
  const tm = textMetrics(m)
  const W = m.page.contentWidth
  const head = headingNode(section, m, ctx, { guide: !text })
  b.add('head', head.node, head.height, { keepWithNext: true })
  const contact = [m.data.org.phone, m.data.org.email].filter(Boolean).join(' · ')
  const service = o.showServiceContact && contact && !compactLegal(m) ? t('warranty.service', { contact }) : ''
  if (!text && m.ghost && !m.editable) {
    b.add('ghost', <Ghost>{t('ghost.warranty')}</Ghost>, lineH(tm.body))
    return b.list
  }
  const parsed = o.variant === 'matrix' && !compactLegal(m) ? parseWarranty(text) : null
  if (parsed) {
    b.add(
      'matrix',
      <div className="dkd-warr" data-field={m.canEdit('warranty') ? 'warranty' : undefined} data-dk-text={m.canEdit('warranty') ? '' : undefined}>
        <div className="dkd-warr__row dkd-warr__row--head">
          <span className="dkd-label">{t('warranty.component')}</span>
          <span className="dkd-label dkd-right">{t('warranty.coverage')}</span>
        </div>
        {parsed.rows.map((r, i) => (
          <div key={i} className="dkd-warr__row">
            <span>{r.component}</span>
            <span className="dkd-warr__years dkd-num dkd-right">{r.months ? t('warranty.months', { count: r.months }) : t('warranty.years', { count: r.years ?? 0 })}</span>
          </div>
        ))}
        {parsed.rest ? <p className="dkd-warr__rest">{parsed.rest}</p> : null}
        {service ? <p className="dkd-warr__service" data-dk-el="showServiceContact">{service}</p> : null}
      </div>,
      (parsed.rows.length + 1) * (lineH(tm.body) + 14) + (parsed.rest ? lineCount(parsed.rest, W, tm.small) * lineH(tm.small) + 8 : 0) + (service ? lineH(tm.small) + 8 : 0),
    )
    return b.list
  }
  b.add(
    'text',
    <div className={clsx('dkd-warr', 'dkd-warr--plain', !text && 'dkd-guide')}>
      <DocText m={m} field="warranty" value={text} placeholder={t('warranty.title')} />
      {service ? <p className="dkd-warr__service" data-dk-el="showServiceContact">{service}</p> : null}
    </div>,
    Math.max(lineH(tm.body), richTextHeight(richOf(text || ' '), W, tm.body, m.placeholders)) + (service ? lineH(tm.small) + 8 : 0),
  )
  return b.list
}

// ── Aceptación ──────────────────────────────────────────────────────────────

export const renderAcceptance: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'acceptance'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const { t, fmt } = m.kit
  const d = m.data
  const tm = textMetrics(m)
  const url = d.quote.portalUrl
  const online = isQrValue(url) && (o.showQr || o.showOnlineLink)
  const short = url ? url.replace(/^https?:\/\//, '') : ''
  const head = headingNode(section, m, ctx)
  b.add('head', head.node, head.height, { keepWithNext: true })
  const adviser =
    m.texts.signatureName || m.canEdit('signatureName') ? (
      <p className={clsx('dkd-acc__by', !m.texts.signatureName && 'dkd-guide')}>
        <DocText m={m} field="signatureName" value={m.texts.signatureName} as="span" inline placeholder={t('fields.adviser')} className="dkd-strong" />
        {[d.org.phone, d.org.email].filter(Boolean).length ? <span className="dkd-muted"> · {[d.org.phone, d.org.email].filter(Boolean).join(' · ')}</span> : null}
      </p>
    ) : null

  if (d.quote.acceptedBy) {
    const a = d.quote.acceptedBy
    b.add(
      'accepted',
      <div className="dkd-acc dkd-acc--accepted">
        <svg className="dkd-acc__check" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6 10.4l2.7 2.7L14.2 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div className="dkd-strong">{t('acceptance.accepted')}</div>
          <div className="dkd-muted">{t('acceptance.acceptedBy', { name: [a.name, a.rut ? t('doc.taxIdValue', { value: a.rut }) : ''].filter(Boolean).join(' · '), date: fmt.date(a.at.slice(0, 10), 'long') })}</div>
        </div>
      </div>,
      lineH(tm.body) * 2 + 28,
    )
    return b.list
  }

  const qrSize = o.variant === 'inline' ? 76 : 96
  const sign = o.variant !== 'online_only' && o.showSignatureLines
  const lines = sign ? (
    <div className="dkd-sign" data-dk-el="showSignatureLines">
      <div className="dkd-sign__field">
        <span className="dkd-sign__space" />
        <span className="dkd-label">{t('acceptance.signature')}</span>
      </div>
      <div className="dkd-sign__field">
        <span className="dkd-sign__space" />
        <span className="dkd-label">{t('acceptance.nameId')}</span>
      </div>
      <div className="dkd-sign__field">
        <span className="dkd-sign__space" />
        <span className="dkd-label">{t('acceptance.date')}</span>
      </div>
    </div>
  ) : null
  const stamp = o.assetId ? m.assets[o.assetId] : undefined
  const company = o.showCompanySignature ? (
    <div className="dkd-sign dkd-sign--company" data-dk-el="showCompanySignature">
      <div className="dkd-sign__field">
        <span className="dkd-sign__space" data-dk-image="assetId">{stamp ? <img className="dkd-sign__img" src={stamp} alt="" /> : null}</span>
        <span className="dkd-label">{t('acceptance.company', { company: d.org.name })}</span>
      </div>
    </div>
  ) : null
  const qr = online ? (
    <div className="dkd-acc__online">
      {o.showQr ? <span data-dk-el="showQr"><QrCode value={url!} size={qrSize} label={t('acceptance.qrLabel')} ink={m.tokens.palette.ink} /></span> : null}
      <div className="dkd-acc__online-text">
        <span className="dkd-strong">{t('acceptance.online')}</span>
        {o.showOnlineLink ? <span className="dkd-small" data-dk-el="showOnlineLink">{t('acceptance.onlineHint', { url: short })}</span> : null}
      </div>
    </div>
  ) : null
  const signH = sign ? 54 + lineH(tm.label) : 0
  const statementH = o.showStatement ? lineCount(t('acceptance.statement'), m.page.contentWidth - (online ? 228 : 0), tm.body) * lineH(tm.body) + 10 : 0
  const height = Math.max(statementH + signH + (company ? 54 + lineH(tm.label) : 0), online ? qrSize + 8 : 0) + (adviser ? lineH(tm.small) + 12 : 0) + 4
  b.add(
    'accept',
    <div className={clsx('dkd-acc', `dkd-acc--${o.variant}`, online && 'dkd-acc--qr')}>
      <div className="dkd-acc__main">
        {o.variant !== 'online_only' && o.showStatement ? <p className="dkd-acc__statement" data-dk-el="showStatement">{t('acceptance.statement')}</p> : null}
        {lines}
        {company}
        {adviser}
      </div>
      {qr}
    </div>,
    o.variant === 'online_only' ? Math.max(qrSize, lineH(tm.body) * 3) + (adviser ? lineH(tm.small) + 12 : 0) + 8 : height,
  )
  return b.list
}

// ── Quiénes somos, galería y texto libre ────────────────────────────────────

export const renderAboutUs: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'about_us'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const content = o.content
  const editing = !!m.onSectionEdit
  if ((!content || content.blocks.length === 0) && !editing) return b.list
  const tm = textMetrics(m)
  const image = o.assetId ? m.assets[o.assetId] : undefined
  const W = m.page.contentWidth
  const textW = image ? W * 0.56 : Math.min(W, 620)
  const head = headingNode(section, m, ctx)
  b.add('head', head.node, head.height, { keepWithNext: true })
  const body = editing ? (
    <EditableText value={content ? richTextToSource(content) : ''} editable onChange={(v) => m.onSectionEdit?.(section.id, 'content', v)} placeholder={m.kit.t('about.title')} display={content?.blocks.length ? <RichBlocks blocks={content.blocks} values={m.placeholders} /> : undefined} />
  ) : (
    <RichBlocks blocks={content!.blocks} values={m.placeholders} />
  )
  const textH = Math.max(lineH(tm.body) * 2, richTextHeight(content, textW, tm.body, m.placeholders))
  const contact = o.showContact ? [m.data.org.phone, m.data.org.email, m.data.org.website?.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ') : ''
  b.add(
    'about',
    <div className={clsx('dkd-about', image && 'dkd-about--image', `dkd-about--${o.variant}`)}>
      <div className="dkd-about__text">
        {o.variant === 'story' ? <OrgLogo org={m.data.org} size="sm" /> : null}
        {body}
        {contact ? <p className="dkd-muted dkd-small" data-dk-el="showContact">{contact}</p> : null}
      </div>
      {image ? <img className="dkd-img dkd-about__img" src={image} alt="" data-dk-image="assetId" /> : null}
    </div>,
    Math.max(textH + (contact ? lineH(tm.small) + 8 : 0) + (o.variant === 'story' ? 44 : 0), image ? 220 : 0),
  )
  return b.list
}

export const renderGallery: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'gallery'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const images = o.images.map((img, index) => ({ ...img, index, src: m.assets[img.assetId] })).filter((img): img is typeof img & { src: string } => typeof img.src === 'string' && /^data:image\//.test(img.src))
  if (images.length === 0) return b.list
  const { t } = m.kit
  const tm = textMetrics(m)
  const W = m.page.contentWidth
  const head = headingNode(section, m, ctx)
  b.add('head', head.node, head.height, { keepWithNext: true })
  const cols = o.variant === 'hero' ? 1 : o.variant === 'before_after' ? 2 : Math.max(2, Math.min(3, o.columns))
  const cellW = (W - (cols - 1) * 14) / cols
  const imgH = Math.round(o.variant === 'hero' ? Math.min(m.page.bodyHeight * 0.55, W * 0.6) : cellW * (o.variant === 'material_board' ? 1 : 0.72))
  for (let i = 0; i < images.length; i += cols) {
    const row = images.slice(i, i + cols)
    const captioned = row.some((r) => r.caption) || o.variant === 'before_after'
    b.add(
      `r${i}`,
      <div className={clsx('dkd-imgs', `dkd-imgs--${o.variant}`)} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {row.map((img, j) => (
          <figure key={j}>
            <img className="dkd-img" src={img.src} alt={img.alt ?? img.caption ?? ''} style={{ height: imgH }} data-dk-image={`images:${img.index}`} />
            {captioned ? <figcaption>{img.caption ?? (o.variant === 'before_after' ? (j === 0 ? t('gallery.before') : t('gallery.after')) : '')}</figcaption> : null}
          </figure>
        ))}
      </div>,
      imgH + (captioned ? lineH(tm.small) + 8 : 0),
      { space: i === 0 ? undefined : 14 },
    )
  }
  return b.list
}

export const renderCustomText: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'custom_text'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const editing = !!m.onSectionEdit
  const content = o.content
  if (content.blocks.length === 0 && !editing && !section.title) return b.list
  const tm = textMetrics(m)
  const W = m.page.contentWidth
  // El título es opcional: sin él no se imprime; se ofrece para escribirlo solo con la sección elegida.
  if (section.title || (editing && m.selectedSectionId === section.id)) {
    const head = headingNode(section, m, ctx)
    b.add('head', head.node, head.height, { keepWithNext: true })
  }
  const cls = clsx('dkd-ct', `dkd-ct--${o.variant}`)
  if (editing && content.blocks.length === 0) {
    b.add('edit', <div className={clsx(cls, 'dkd-guide')}><EditableText value="" editable onChange={(v) => m.onSectionEdit?.(section.id, 'content', v)} placeholder="…" /></div>, lineH(tm.body) * 2 + 20)
    return b.list
  }
  const width = o.variant === 'two_columns' ? (W - 28) / 2 : o.variant === 'callout' ? W - 40 : W
  const factor = o.variant === 'two_columns' ? 2 : 1
  const chunks = chunkRichBlocks(content.blocks, width, tm.body, m.page.bodyHeight * 0.45 * factor, m.placeholders)
  chunks.forEach((blocks, i) => {
    const h = richTextHeight({ blocks }, width, tm.body, m.placeholders)
    b.add(`c${i}`, <div className={cls}><TextChunk chunks={chunks} index={i} values={m.placeholders} editable={editing} onChange={(v) => m.onSectionEdit?.(section.id, 'content', v)} /></div>, Math.ceil(h / factor + (factor > 1 ? lineH(tm.body) : 0)) + (o.variant === 'callout' ? 28 : 0), { space: i === 0 ? undefined : 6 })
  })
  return b.list
}

export const renderPageBreak: SectionRenderer = (raw, m, ctx) => {
  const b = sectionBlocks(raw, m, ctx)
  b.add('break', <span className="dkd-break" aria-hidden="true" />, 0, { breakBefore: true, space: 0 })
  return b.list
}

