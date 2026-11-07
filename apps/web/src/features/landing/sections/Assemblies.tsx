import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { WindowDrawing } from '@dekopen/documents'
import { computeLayout, createAssembly } from '@dekopen/engine'
import { useMemo } from 'react'
import { useLocale, useT } from '../../../lib/i18n'
import { Caption, Container, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import { DrawingBoundary } from '../designer/DrawingBoundary'
import { useElementSize } from '../designer/useElementSize'
import es from '../i18n/es'

function sampleAssembly() {
  const line = SAMPLE_CATALOG.lines.find((l) => l.typologyIds.includes('fixed')) ?? SAMPLE_CATALOG.lines[0]
  const glass = SAMPLE_CATALOG.glass.find((g) => g.kind === 'dvh') ?? SAMPLE_CATALOG.glass[0]
  const design = createAssembly('coupled_mixed', { lineId: line?.id ?? '', colorId: 'blanco', glassId: glass?.id ?? '' }, SAMPLE_CATALOG)
  return { design, layout: computeLayout(design, SAMPLE_CATALOG) }
}

/** Conjuntos: un dibujo real del motor, con el catálogo de ejemplo. */
export function Assemblies() {
  const t = useT(es)
  const { locale } = useLocale()
  const [boxRef, box] = useElementSize<HTMLDivElement>({ width: 620, height: 380 })
  const drawing = useMemo(() => {
    try {
      return sampleAssembly()
    } catch {
      return null
    }
  }, [])

  return (
    <Section id="conjuntos" labelledBy="assemblies-title">
      <Container className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-6">
          <SectionTitle id="assemblies-title">{t('assemblies.title')}</SectionTitle>
          <Lead className="mt-5">{t('assemblies.lead')}</Lead>
          <p className="mt-5 max-w-[58ch] text-base text-pretty text-fg-muted">{t('assemblies.note')}</p>
        </Reveal>
        {drawing ? (
          <Reveal delay={0.06} className="min-w-0 lg:col-span-6">
            <div ref={boxRef}>
              <DrawingBoundary resetKey="assemblies" fallback={null}>
                <WindowDrawing layout={drawing.layout} design={drawing.design} catalog={SAMPLE_CATALOG} dimensions="none" symbols={false} detail="high" locale={locale} width={box.width} title={t('assemblies.drawing')} />
              </DrawingBoundary>
            </div>
            <Caption className="mt-3">{t('assemblies.caption')}</Caption>
          </Reveal>
        ) : null}
      </Container>
    </Section>
  )
}
