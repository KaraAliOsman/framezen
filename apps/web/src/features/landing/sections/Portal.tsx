import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { useMemo, type CSSProperties } from 'react'
import { useFormat, useLocale, useT } from '../../../lib/i18n'
import { PortalCover, PortalHeader } from '../../portal/PortalPage'
import { PortalItemCard } from '../../portal/PortalItemCard'
import { brandColors, portalItems } from '../../portal/portalModel'
import portalEs from '../../portal/i18n/es'
import { Caption, Container, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import es from '../i18n/es'
import { SAMPLE_ACCENT } from '../lib/sampleDoc'
import { useSampleQuote } from '../lib/sampleContext'

/** El portal de verdad: las mismas piezas que abre el cliente, con la cotización de ejemplo. */
export function Portal() {
  const t = useT(es)
  const tp = useT(portalEs)
  const fmt = useFormat()
  const { locale } = useLocale()
  const sample = useSampleQuote()
  const items = useMemo(() => (sample ? portalItems({ quote: sample.quote, catalog: { ...SAMPLE_CATALOG, updatedAt: '' }, prices: sample.prices }, locale) : []), [sample, locale])
  const colors = brandColors(SAMPLE_ACCENT)
  const style = { '--brand': colors.accent, '--brand-on': colors.onAccent, '--brand-ink': colors.ink } as CSSProperties

  return (
    <Section id="portal" labelledBy="portal-section-title" className="overflow-hidden pb-0! lg:pb-0!">
      <Container className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-6 lg:pt-16">
          <SectionTitle id="portal-section-title">{t('portal.title')}</SectionTitle>
          <Lead className="mt-5">{t('portal.lead')}</Lead>
          <p className="mt-5 max-w-[58ch] text-base text-pretty text-fg-muted">{t('portal.plan')}</p>
          <Caption className="mt-8">{t('portal.caption')}</Caption>
        </Reveal>
        <Reveal delay={0.06} className="lg:col-span-5 lg:col-start-8">
          {sample ? (
            <div inert aria-hidden data-theme="light" style={style} className="mx-auto h-[640px] max-w-[390px] overflow-hidden rounded-t-dialog bg-canvas pb-6 shadow-pop text-fg lg:h-[760px]">
              <PortalHeader name={t('sample.shop')} />
              <div className="px-4">
                <PortalCover
                  label={tp('quote.label', { number: fmt.docNumber(sample.quote.number) })}
                  title={sample.quote.title}
                  meta={tp('quote.forClient', { name: t('sample.client') })}
                  status="awaiting"
                />
                <div className="mt-6">{items[0] ? <PortalItemCard item={items[0]} catalog={SAMPLE_CATALOG} can3d={false} onOpen3d={() => undefined} /> : null}</div>
              </div>
            </div>
          ) : null}
        </Reveal>
      </Container>
    </Section>
  )
}
