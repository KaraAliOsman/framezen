import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { WindowDrawing } from '@dekopen/documents'
import { computeLayout, createDesign } from '@dekopen/engine'
import { DEFAULT_QUOTE_PRESET_ID, DOC_PRESETS, TRIAL_DAYS } from '@dekopen/shared'
import { lazy, Suspense, useMemo } from 'react'
import { useLocale, useT } from '../../../lib/i18n'
import { ButtonLink, Caption, Container, Reveal } from '../components/primitives'
import { DrawingBoundary } from '../designer/DrawingBoundary'
import { useElementSize } from '../designer/useElementSize'
import es from '../i18n/es'
import { useSampleQuote } from '../lib/sampleContext'

const QuoteSheet = lazy(() => import('./QuoteSheet'))

/** Ancho de la hoja A4 a 96 dpi. */
const PAGE_WIDTH = 794

function heroWindow() {
  const line = SAMPLE_CATALOG.lines.find((l) => l.typologyIds.includes('sliding_4')) ?? SAMPLE_CATALOG.lines[0]
  const glass = SAMPLE_CATALOG.glass.find((g) => g.kind === 'dvh') ?? SAMPLE_CATALOG.glass[0]
  const design = createDesign('sliding_4', { lineId: line?.id ?? '', width: 4800, height: 2100, colorId: 'antracita', glassId: glass?.id ?? '' })
  return { design, layout: computeLayout(design, SAMPLE_CATALOG) }
}

export function Hero() {
  const t = useT(es)
  const { locale } = useLocale()
  const sample = useSampleQuote()
  const [stageRef, stage] = useElementSize<HTMLDivElement>({ width: 1440, height: 640 })
  const hero = useMemo(() => {
    try {
      return heroWindow()
    } catch {
      return null
    }
  }, [])
  const phone = stage.width < 700
  const sheetWidth = phone ? 164 : Math.min(360, Math.round(stage.width * 0.25))

  return (
    <section aria-labelledby="hero-title" className="bg-canvas">
      <Container className="pt-10 sm:pt-16 lg:pt-20">
        <Reveal as="h1" when="mount" id="hero-title" className="font-display text-display-sm font-medium text-balance text-fg-strong lg:text-display xl:text-display-lg">
          {t('hero.title')}
        </Reveal>
        <Reveal when="mount" delay={0.06} className="mt-6 grid gap-6 lg:mt-10 lg:grid-cols-12 lg:items-end">
          <p className="max-w-[58ch] text-lead text-pretty text-fg-muted lg:col-span-7">{t('hero.lead')}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:col-span-5 lg:justify-end">
            <ButtonLink to="/crear-cuenta" variant="primary" size="lg" arrow>
              {t('hero.cta', { days: TRIAL_DAYS })}
            </ButtonLink>
            <p className="text-table text-fg-muted">{t('hero.note')}</p>
          </div>
        </Reveal>
      </Container>

      {/* La portada es el producto: una ventana real en su muro y la cotización que la vende. */}
      <div ref={stageRef} className="relative mt-10 h-[320px] overflow-hidden bg-sunken sm:mt-14 sm:h-[480px] lg:h-[640px]">
        {hero ? (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ">
            <DrawingBoundary resetKey="hero" fallback={null}>
              <WindowDrawing
                layout={hero.layout}
                design={hero.design}
                catalog={SAMPLE_CATALOG}
                context="wall"
                dimensions="none"
                symbols={false}
                detail="high"
                locale={locale}
                width={Math.max(stage.width, phone ? 640 : 960)}
                title={t('hero.drawing')}
              />
            </DrawingBoundary>
          </div>
        ) : null}
        {sample ? (
          <div className="absolute top-6 right-4 shadow-pop sm:top-10 sm:right-8 lg:top-14 lg:right-[max(48px,calc((100%-1312px)/2+48px))]" style={{ width: sheetWidth, height: Math.round(sheetWidth * 1.414) }}>
            <Suspense fallback={<div className="size-full bg-canvas" />}>
              <QuoteSheet doc={sample.doc} template={DOC_PRESETS[DEFAULT_QUOTE_PRESET_ID]} scale={sheetWidth / PAGE_WIDTH} className="lp-first-page size-full overflow-hidden bg-canvas" />
            </Suspense>
          </div>
        ) : null}
      </div>
      <Container className="pt-3">
        <Caption>{t('hero.caption')}</Caption>
      </Container>
    </section>
  )
}
