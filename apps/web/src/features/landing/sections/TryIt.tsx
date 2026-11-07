import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { TypologyIcon, WindowDrawing } from '@dekopen/documents'
import { clsx } from 'clsx'
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useLocale, useT } from '../../../lib/i18n'
import { ColorSwatch, Field, Input } from '../../../ui'
import { Container, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import { buildExample, DEFAULT_TYPOLOGY, HERO_TYPOLOGIES, isWithinLimits, typologyOption, type ExampleResult, type HeroTypology } from '../designer/designerModel'
import { DrawingBoundary } from '../designer/DrawingBoundary'
import { useElementSize } from '../designer/useElementSize'
import es from '../i18n/es'
import { priceBreakdown } from '../lib/breakdown'
import { formatClp, formatInt, formatMm, parseMeasure } from '../lib/format'
import { useSampleText } from '../lib/sampleText'

interface Size {
  width: number
  height: number
}

const toRaw = (size: Size) => ({ width: formatMm(size.width), height: formatMm(size.height) })

/**
 * Pruébalo aquí: tipología + ancho × alto + color → dibujo a escala y precio de ejemplo con su
 * desglose. Lo calcula en el navegador el mismo motor de la app, con el catálogo de muestra.
 */
export function TryIt() {
  const t = useT(es)
  const { locale } = useLocale()
  const sample = useSampleText()
  const [typology, setTypology] = useState<HeroTypology>(DEFAULT_TYPOLOGY)
  const option = typologyOption(typology)
  const [raw, setRaw] = useState(() => toRaw(option.defaultSize))
  const [size, setSize] = useState<Size>(option.defaultSize)
  const [colorId, setColorId] = useState<string | undefined>(undefined)
  const [stageRef, stage] = useElementSize<HTMLDivElement>({ width: 720, height: 480 })
  const hintId = useId()

  const { limits } = option
  const typed = { width: parseMeasure(raw.width).first, height: parseMeasure(raw.height).first }
  const widthValid = typed.width !== null && typed.width >= limits.minWidth && typed.width <= limits.maxWidth
  const heightValid = typed.height !== null && typed.height >= limits.minHeight && typed.height <= limits.maxHeight

  const example = useMemo<ExampleResult | null>(() => {
    try {
      return buildExample({ typology, width: size.width, height: size.height, colorId }, SAMPLE_CATALOG)
    } catch {
      return null
    }
  }, [typology, size.width, size.height, colorId])
  const breakdown = useMemo(() => (example ? priceBreakdown({ typology, width: size.width, height: size.height, colorId }) : null), [example, typology, size.width, size.height, colorId])

  function chooseTypology(next: HeroTypology) {
    const nextOption = typologyOption(next)
    setTypology(next)
    setSize(nextOption.defaultSize)
    setRaw(toRaw(nextOption.defaultSize))
  }

  function commit(next: { width: string; height: string }) {
    setRaw(next)
    const width = parseMeasure(next.width).first
    const height = parseMeasure(next.height).first
    if (width !== null && height !== null && isWithinLimits(option, width, height)) setSize({ width, height })
  }

  function onMeasureChange(axis: keyof Size, value: string) {
    // Si pegan «1200x1500» en cualquiera de los dos campos, repartimos ambas medidas.
    const parsed = parseMeasure(value)
    if (parsed.first !== null && parsed.second !== null) {
      commit({ width: formatMm(parsed.first), height: formatMm(parsed.second) })
      return
    }
    commit({ ...raw, [axis]: value })
  }

  function onMeasureKey(axis: keyof Size, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const current = parseMeasure(raw[axis]).first ?? size[axis]
    const step = (event.shiftKey ? 100 : 10) * (event.key === 'ArrowUp' ? 1 : -1)
    const min = axis === 'width' ? limits.minWidth : limits.minHeight
    const max = axis === 'width' ? limits.maxWidth : limits.maxHeight
    commit({ ...raw, [axis]: formatMm(Math.min(max, Math.max(min, Math.round(current + step)))) })
  }

  const limitsText = t('designer.limits', {
    minWidth: formatInt(limits.minWidth),
    maxWidth: formatInt(limits.maxWidth),
    minHeight: formatInt(limits.minHeight),
    maxHeight: formatInt(limits.maxHeight),
  })
  const invalid = !widthValid || !heightValid
  const drawingKey = `${typology}-${size.width}-${size.height}-${colorId ?? ''}`
  const fallback = <p className="px-6 text-center text-base text-fg-muted">{t('designer.fallback')}</p>

  return (
    <Section id="precio" labelledBy="tryit-title">
      <Container>
        <Reveal className="max-w-3xl">
          <SectionTitle id="tryit-title">{t('tryit.title')}</SectionTitle>
          <Lead className="mt-5">{t('tryit.lead')}</Lead>
        </Reveal>

        <Reveal className="mt-12 lg:mt-16">
          <div role="group" aria-label={t('designer.label')} className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
            <div ref={stageRef} className="relative flex h-[320px] items-center justify-center overflow-hidden rounded-panel bg-sunken sm:h-[420px] lg:col-span-8 lg:h-auto lg:min-h-[560px]">
              {example ? (
                <DrawingBoundary resetKey={drawingKey} fallback={fallback}>
                  <WindowDrawing
                    layout={example.layout}
                    design={example.design}
                    catalog={SAMPLE_CATALOG}
                    view="interior"
                    locale={locale}
                    dimensions="total"
                    width={Math.max(160, stage.width - 64)}
                    height={Math.max(160, stage.height - 64)}
                    title={sample.typology(typology)}
                  />
                </DrawingBoundary>
              ) : (
                fallback
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-6 lg:col-span-4">
              <fieldset className="min-w-0">
                <legend className="text-table font-medium text-fg-strong">{t('designer.typology')}</legend>
                <div role="radiogroup" aria-label={t('designer.typology')} className="mt-2 -ml-2 flex flex-wrap gap-1">
                  {HERO_TYPOLOGIES.map(({ id }) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={id === typology}
                      onClick={() => chooseTypology(id)}
                      className={clsx(
                        'inline-flex h-9 items-center gap-1.5 rounded-control px-2 text-base transition-colors duration-100 touch:h-11',
                        id === typology ? 'bg-accent-subtle font-medium text-fg-strong' : 'text-fg-muted hover:bg-hover hover:text-fg-strong',
                      )}
                    >
                      <TypologyIcon typologyId={id} size={16} strokeWidth={1.75} aria-hidden />
                      {t(`designer.typologies.${id}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t('designer.width')} error={widthValid ? undefined : ' '}>
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    value={raw.width}
                    suffix="mm"
                    aria-describedby={invalid ? hintId : undefined}
                    onChange={(e) => onMeasureChange('width', e.target.value)}
                    onKeyDown={(e) => onMeasureKey('width', e)}
                    onBlur={() => !invalid && setRaw(toRaw(size))}
                  />
                </Field>
                <Field label={t('designer.height')} error={heightValid ? undefined : ' '}>
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    value={raw.height}
                    suffix="mm"
                    aria-describedby={invalid ? hintId : undefined}
                    onChange={(e) => onMeasureChange('height', e.target.value)}
                    onKeyDown={(e) => onMeasureKey('height', e)}
                    onBlur={() => !invalid && setRaw(toRaw(size))}
                  />
                </Field>
                {invalid ? (
                  <p id={hintId} role="status" className="col-span-2 -mt-1 text-table text-warning">
                    {limitsText}
                  </p>
                ) : null}
              </div>

              {example?.colors.length ? (
                <div>
                  <p className="text-table font-medium text-fg-strong">{t('designer.color')}</p>
                  <div role="radiogroup" aria-label={t('designer.color')} className="mt-2 -ml-2 flex flex-wrap gap-1">
                    {example.colors.map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        role="radio"
                        aria-checked={color.id === example.color?.id}
                        onClick={() => setColorId(color.id)}
                        className={clsx(
                          'inline-flex h-9 items-center gap-1.5 rounded-control px-2 text-base transition-colors duration-100 touch:h-11',
                          color.id === example.color?.id ? 'bg-accent-subtle font-medium text-fg-strong' : 'text-fg-muted hover:bg-hover hover:text-fg-strong',
                        )}
                      >
                        <ColorSwatch hex={color.hex} size="sm" />
                        {sample.color(color.id, color.name)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-auto">
                {breakdown ? (
                  <>
                    <p className="tabular font-display text-display-sm font-medium text-fg-strong" data-testid="example-price">
                      {formatClp(breakdown.total)}
                    </p>
                    <p className="mt-0.5 text-table text-fg-muted">{t('designer.examplePrice')}</p>
                    <dl data-testid="price-breakdown" className="mt-5 text-table">
                      {breakdown.rows.map((row) => (
                        <div key={row.key} className="flex items-baseline justify-between gap-4 py-0.5">
                          <dt className="text-fg-muted">{t(`designer.breakdown.${row.key}`)}</dt>
                          <dd className="tabular text-fg">{formatClp(row.amount)}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : (
                  <p className="text-base text-fg-muted">{t('designer.noPrice')}</p>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
