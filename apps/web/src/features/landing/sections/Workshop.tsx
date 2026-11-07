import type { Bar, OptimizationGroup } from '@dekopen/engine'
import { useT } from '../../../lib/i18n'
import { Caption, Container, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import es from '../i18n/es'
import { formatInt, formatMm } from '../lib/format'
import { useSampleQuote } from '../lib/sampleContext'

const DOCS = ['workOrder', 'cuts', 'cutOrder', 'glass', 'glassPlan', 'materials', 'couplers', 'assembly', 'labels', 'survey', 'installation'] as const

/** Máximo de barras que se dibujan: lo justo para ver cómo se aprovechan. */
const MAX_BARS = 6

function CutBar({ bar }: { bar: Bar }) {
  const t = useT(es)
  const cuts = bar.cuts.map((cut) => formatMm(cut.length)).join(', ')
  return (
    <li aria-label={t('workshop.barAria', { cuts, rest: formatMm(bar.remainder) })} className="flex h-9 gap-px overflow-hidden rounded-xs bg-hover">
      {bar.cuts.map((cut, index) => (
        <span
          key={`${cut.offset}-${index}`}
          className="flex min-w-0 items-center justify-center bg-accent text-fg-on-accent"
          style={{ flexGrow: 0, flexShrink: 0, flexBasis: `${(cut.length / bar.barLength) * 100}%` }}
        >
          <span aria-hidden className="tabular truncate px-1 text-table font-medium">
            {formatMm(cut.length)}
          </span>
        </span>
      ))}
    </li>
  )
}

/** Los perfiles que dan más piezas, hasta completar el tope de barras. */
function barsToShow(groups: readonly OptimizationGroup[]): { name: string; bars: Bar[] }[] {
  const out: { name: string; bars: Bar[] }[] = []
  let left = MAX_BARS
  for (const group of [...groups].sort((a, b) => b.pieces - a.pieces)) {
    if (left <= 0) break
    const bars = group.bars.slice(0, left)
    left -= bars.length
    out.push({ name: group.name, bars })
  }
  return out
}

/** La sección negra: del «sí» del cliente a la sierra, con los cortes que calcula el optimizador real. */
export function Workshop() {
  const t = useT(es)
  const plan = useSampleQuote()?.cuts
  return (
    <Section id="taller" labelledBy="workshop-title" tone="dark">
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-5">
          <SectionTitle id="workshop-title">{t('workshop.title')}</SectionTitle>
          <Lead className="mt-5">{t('workshop.lead')}</Lead>
          <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-2 text-base text-fg">
            {DOCS.map((doc) => (
              <li key={doc}>{t(`workshop.docs.${doc}`)}</li>
            ))}
          </ul>
        </Reveal>

        {plan ? (
          <Reveal delay={0.06} className="min-w-0 lg:col-span-7">
            <dl className="flex gap-12">
              <div className="flex flex-col-reverse">
                <dt className="mt-1 text-table text-fg-muted">{t('workshop.stats.bars')}</dt>
                <dd className="tabular font-display text-display-sm font-medium text-fg-strong">{formatInt(plan.totalBars)}</dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="mt-1 text-table text-fg-muted">{t('workshop.stats.pieces')}</dt>
                <dd className="tabular font-display text-display-sm font-medium text-fg-strong">{formatInt(plan.totalPieces)}</dd>
              </div>
            </dl>
            <div className="mt-10 flex flex-col gap-6">
              {barsToShow(plan.groups).map((group) => (
                <div key={group.name}>
                  <h3 className="text-table text-fg-muted">{group.name}</h3>
                  <ul className="mt-2 flex flex-col gap-1">
                    {group.bars.map((bar, index) => (
                      <CutBar key={index} bar={bar} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <Caption className="mt-6">{t('workshop.caption')}</Caption>
          </Reveal>
        ) : null}
      </Container>
    </Section>
  )
}
