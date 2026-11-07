import { DOC_PRESETS, presetDescription, presetName, QUOTE_PRESET_IDS, type QuotePresetId } from '@dekopen/shared'
import { clsx } from 'clsx'
import { lazy, Suspense, useState } from 'react'
import { useLocale, useT } from '../../../lib/i18n'
import { Caption, Container, Lead, PAGE_WIDTH as PAGE_MAX, Reveal, Section, SectionTitle } from '../components/primitives'
import es from '../i18n/es'
import { useSampleQuote } from '../lib/sampleContext'

const QuoteSheet = lazy(() => import('./QuoteSheet'))

/** Alto visible de las hojas: A4 a escala 0,5. */
const SHEET_SCALE = 0.5
const SHEET_HEIGHT = Math.round(1123 * SHEET_SCALE)

/**
 * La cotización real, entera y de corrido. Se elige entre las plantillas y se recorre deslizando.
 */
export function QuotePages() {
  const t = useT(es)
  const { locale } = useLocale()
  const sample = useSampleQuote()
  const [preset, setPreset] = useState<QuotePresetId>('hogar')

  return (
    <Section id="cotizacion" labelledBy="quote-title" tone="sunken" className="overflow-hidden">
      <Container>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
          <Reveal className="lg:col-span-7">
            <SectionTitle id="quote-title">{t('quote.title')}</SectionTitle>
            <Lead className="mt-5">{t('quote.lead', { count: QUOTE_PRESET_IDS.length })}</Lead>
          </Reveal>
          <Reveal delay={0.06} className="lg:col-span-5 lg:self-end">
            <div role="radiogroup" aria-label={t('quote.templates')} className="-ml-2.5 flex flex-wrap gap-1">
              {QUOTE_PRESET_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={id === preset}
                  onClick={() => setPreset(id)}
                  className={clsx(
                    'h-9 rounded-control px-2.5 text-base transition-colors duration-100 touch:h-11',
                    id === preset ? 'bg-canvas font-medium text-fg-strong shadow-raised' : 'text-fg-muted hover:bg-hover hover:text-fg-strong',
                  )}
                >
                  {presetName(id, locale)}
                </button>
              ))}
            </div>
            <p className="mt-3 min-h-10 max-w-[52ch] text-table text-fg-muted">{presetDescription(preset, locale)}</p>
          </Reveal>
        </div>
      </Container>

      <div tabIndex={0} role="region" aria-label={t('quote.rail')} className="lp-rail scrollbar-quiet mt-10 overflow-x-auto overscroll-x-contain outline-none lg:mt-14">
        <div className={clsx('mx-auto', PAGE_MAX)} style={{ height: SHEET_HEIGHT + 24 }}>
          {sample ? (
            <Suspense fallback={<div style={{ height: SHEET_HEIGHT }} />}>
              <QuoteSheet doc={sample.doc} template={DOC_PRESETS[preset]} scale={SHEET_SCALE} className="lp-sheets pl-4 sm:pl-8 lg:pl-12" />
            </Suspense>
          ) : null}
        </div>
      </div>

      <Container className="mt-4">
        <Caption>{t('quote.caption')}</Caption>
      </Container>
    </Section>
  )
}
