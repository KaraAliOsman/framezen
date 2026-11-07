/**
 * Portada: una hoja fija y limpia con logo, cliente, proyecto y fecha. Nunca lleva precios ni cifras
 * del negocio (la opción no existe). Variantes: `typographic` (sólo tipografía), `drawing` (la ventana
 * protagonista), `elevation` (la fachada a una misma escala), `photo` y `split` (con la foto subida;
 * sin foto, el dibujo). Con fondo intenso o acento, el campo de color va a sangre.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { DocSectionOf } from '@dekopen/shared'
import { clsx } from '../../base/clsx'
import { EditableText } from '../../base/editable'
import { joinParts } from '../../base/format'
import type { QuoteDocItemV5 } from '../../data/quote'
import type { FlowBlock } from '../flow'
import type { QuoteModel } from '../model'
import { DocText, DottedText, fillLine, ItemDrawing, OrgLogo } from '../parts'
import type { SectionRenderer } from './common'
import { itemTitle } from './item-parts'

type Cover = DocSectionOf<'cover'>

function Elevation({ m, items, width, height }: { m: QuoteModel; items: QuoteDocItemV5[]; width: number; height: number }) {
  const gap = 24
  let list = items.slice(0, 6)
  let scale = 0
  for (;;) {
    const sumW = list.reduce((a, it) => a + Math.max(1, it.width), 0)
    const maxH = list.reduce((a, it) => Math.max(a, it.height), 1)
    scale = Math.min((width - gap * (list.length - 1)) / sumW, height / maxH)
    const narrowest = list.reduce((a, it) => Math.min(a, it.width), Infinity)
    if (list.length <= 2 || narrowest * scale >= 40) break
    list = list.slice(0, -1)
  }
  return (
    <div className="dkd-elev" style={{ height }}>
      {list.map((it) => (
        <ItemDrawing key={it.ref} m={m} item={it} width={it.width * scale + 4} height={it.height * scale + 4} dimensions="none" />
      ))}
    </div>
  )
}

export const renderCover: SectionRenderer = (raw, m) => {
  const section = raw as Cover
  const o = section.options
  const { t, fmt } = m.kit
  const d = m.data
  const image = o.assetId ? m.assets[o.assetId] : undefined
  const photo = (o.variant === 'photo' || o.variant === 'split') && !!image
  const field = section.tone === 'strong' || section.tone === 'accent'
  const bleed = field || photo
  const page = m.page
  const H = bleed ? page.height : page.coverBodyHeight
  const padX = bleed ? page.margins.left : 0
  const padY = bleed ? page.margins.top : 0
  const client = d.client?.name?.trim()
  const title = o.title ? m.guardTotal(fillLine(o.title, m.placeholders)) : m.title || t('cover.proposal')
  const subtitle = o.subtitle ? m.guardTotal(fillLine(o.subtitle, m.placeholders)) : ''
  const size = title.length > 64 ? 's' : title.length > 30 ? 'm' : 'l'
  const org = d.org
  const identity = joinParts([org.legalName && org.legalName !== org.name ? org.legalName : undefined, org.rut ? t('doc.taxIdValue', { value: org.rut }) : undefined])
  const hero = m.hero

  const facts: { key: string; label: string; value: ReactNode; el?: string }[] = []
  if (o.showFacts) {
    if (o.showClient && client) facts.push({ key: 'client', label: t('fields.client'), value: client, el: 'showClient' })
    facts.push({ key: 'ref', label: m.docTitle, value: <span className="dkd-num">{m.numberLabel}</span> })
    if (d.quote.date) facts.push({ key: 'date', label: t('doc.issued'), value: <span className="dkd-num">{fmt.date(d.quote.date, 'long')}</span> })
  }

  let stage: ReactNode = null
  if (photo && image) stage = <img className="dkd-cover__photo" src={image} alt="" data-dk-image="assetId" />
  else if (o.variant === 'elevation' && m.counted.length) {
    stage = (
      <div className="dkd-cover__stage">
        <Elevation m={m} items={m.counted} width={page.contentWidth - padX * 0} height={Math.round(H * 0.34)} />
      </div>
    )
  } else if ((o.variant === 'drawing' || o.variant === 'photo' || o.variant === 'split') && hero) {
    stage = (
      <figure className="dkd-cover__stage" aria-label={itemTitle(m, hero)} data-dk-image={o.variant === 'drawing' ? undefined : 'assetId'}>
        <ItemDrawing m={m} item={hero} width={page.contentWidth} height={Math.round(H * 0.46)} dimensions="none" fit />
      </figure>
    )
  }

  // El título propio de la portada manda; sin él, se escribe el nombre de la obra.
  const titleNode = m.onSectionEdit && (o.title || !m.canEdit('title')) ? (
    <EditableText as="span" inline value={o.title ?? title} editable onChange={(v) => m.onSectionEdit?.(section.id, 'title', v)} placeholder={t('fields.project')} display={<DottedText text={title} />} />
  ) : m.canEdit('title') && !o.title ? (
    <DocText m={m} field="title" value={d.quote.title ?? ''} as="span" inline placeholder={t('fields.project')} />
  ) : (
    <DottedText text={title} />
  )
  const subtitleEditable = !!m.onSectionEdit && (!!o.subtitle || m.selectedSectionId === section.id)
  const node = (
    <div
      className={clsx('dkd-cover', `dkd-cover--${o.variant}`, `dkd-cover--tone-${section.tone}`, field && 'dkd-cover--field', bleed && 'dkd-cover--bleed', photo && 'dkd-cover--img', `dkd-cover--t${size}`, !o.showFacts && 'dkd-cover--nofacts')}
      style={{ height: H, '--cv-x': `${padX}px`, '--cv-y': `${padY}px` } as CSSProperties}
    >
      <div className="dkd-cover__mast">
        {o.showLogo ? <OrgLogo org={org} size="lg" /> : <span />}
        {identity ? <span className="dkd-cover__legal">{identity}</span> : null}
      </div>
      {stage}
      <div className="dkd-cover__foot">
        <div className="dkd-cover__titles">
          <h1 className="dkd-cover__title">{titleNode}</h1>
          {subtitleEditable ? (
            <p className={clsx('dkd-cover__subtitle', !subtitle && 'dkd-guide')}>
              <EditableText as="span" inline value={o.subtitle ?? ''} editable onChange={(v) => m.onSectionEdit?.(section.id, 'subtitle', v)} placeholder={t('fields.subtitle')} display={subtitle || undefined} />
            </p>
          ) : subtitle ? (
            <p className="dkd-cover__subtitle">{subtitle}</p>
          ) : null}
        </div>
        {facts.length ? (
          <dl className="dkd-cover__facts" data-dk-el="showFacts">
            {facts.map((f) => (
              <div key={f.key} className="dkd-cover__fact" data-dk-el={f.el}>
                <dt className="dkd-label">{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  )
  const block: FlowBlock = { key: `${section.id}:cover`, sectionId: section.id, sectionType: 'cover', node, height: H, space: 0, page: 'cover', tone: section.tone, ...(bleed ? { bleed: true } : {}) }
  return [block]
}
