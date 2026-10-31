import { SAMPLE_CATALOG } from '@framezen/catalog'
import { TypologyIcon, WindowDrawing } from '@framezen/documents'
import { clsx } from 'clsx'
import { ArrowRight } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { RadioGroup } from 'radix-ui'
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { EASE_IN, EASE_OUT } from '../components/primitives'
import { formatArea, formatClp, formatInt, formatMm, parseMeasure } from '../lib/format'
import { AnimatedNumber } from './AnimatedNumber'
import {
  buildExample,
  DEFAULT_TYPOLOGY,
  HERO_TYPOLOGIES,
  isWithinLimits,
  typologyOption,
  type ExampleResult,
  type HeroTypology,
} from './designerModel'
import { DrawingBoundary } from './DrawingBoundary'
import { examplePrice } from './examplePrice'
import { useElementSize } from './useElementSize'

const TYPOLOGY_TITLE: Record<HeroTypology, string> = {
  fixed: 'Ventana fija',
  casement: 'Abatir 1 hoja',
  tilt_turn: 'Oscilobatiente',
  sliding_2: 'Corredera 2 hojas',
  door: 'Puerta 1 hoja',
}

interface Size {
  width: number
  height: number
}

/**
 * Mini diseñador de la portada: tipología + ancho × alto → dibujo a escala con
 * cotas y precio de ejemplo, calculados en el navegador por el motor real.
 */
export function HeroDesigner() {
  const reduce = useReducedMotion()
  const [typology, setTypology] = useState<HeroTypology>(DEFAULT_TYPOLOGY)
  const option = typologyOption(typology)
  const [raw, setRaw] = useState(() => toRaw(option.defaultSize))
  const [size, setSize] = useState<Size>(option.defaultSize)
  const [colorId, setColorId] = useState<string | undefined>(undefined)
  const [canvasRef, canvas] = useElementSize<HTMLDivElement>({ width: 560, height: 340 })
  const hintId = useId()

  const { limits } = option
  const typed = { width: parseMeasure(raw.width).first, height: parseMeasure(raw.height).first }
  const widthValid = typed.width !== null && typed.width >= limits.minWidth && typed.width <= limits.maxWidth
  const heightValid = typed.height !== null && typed.height >= limits.minHeight && typed.height <= limits.maxHeight
  const typedValid = widthValid && heightValid

  const example = useMemo<ExampleResult | null>(() => {
    try {
      return buildExample({ typology, width: size.width, height: size.height, colorId }, SAMPLE_CATALOG)
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[landing] No se pudo armar el ejemplo', error)
      return null
    }
  }, [typology, size.width, size.height, colorId])

  const price = useMemo(() => (example ? examplePrice(example.design, SAMPLE_CATALOG) : null), [example])

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
    if (width !== null && height !== null && isWithinLimits(option, width, height)) {
      setSize({ width, height })
    }
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

  function onMeasureBlur() {
    if (typedValid) setRaw(toRaw(size))
  }

  const drawingKey = `${typology}-${size.width}-${size.height}-${colorId ?? ''}`
  const limitsText = `${formatInt(limits.minWidth)}–${formatInt(limits.maxWidth)} de ancho y ${formatInt(limits.minHeight)}–${formatInt(limits.maxHeight)} mm de alto`
  const specLine = [example?.line?.name, example?.color?.name, example?.glass?.name].filter(Boolean).join(' · ')

  return (
    <div
      className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0 shadow-float lg:grid lg:grid-cols-[300px_minmax(0,1fr)]"
      role="group"
      aria-label="Mini diseñador de ventanas"
    >
      {/* Controles: arriba en teléfono, a la izquierda en escritorio */}
      <div className="flex flex-col border-b border-paper-200 lg:border-r lg:border-b-0">
        <div className="px-3 py-2 sm:px-4 lg:pt-5 lg:pb-4">
          <p className="hidden px-1 pb-2 text-[12px] font-medium text-paper-600 lg:block">Tipología</p>
          <RadioGroup.Root
            value={typology}
            onValueChange={(value) => chooseTypology(value as HeroTypology)}
            aria-label="Tipología"
            loop
            asChild
          >
            <div className="-mx-1 flex flex-wrap gap-1 p-1 lg:flex-col lg:flex-nowrap">
              {HERO_TYPOLOGIES.map((item) => {
                const selected = item.id === typology
                return (
                  <RadioGroup.Item
                    key={item.id}
                    value={item.id}
                    className={clsx(
                      'relative flex h-10 shrink-0 items-center gap-2.5 rounded-sm px-3 text-left text-[14px] font-medium lg:h-11 lg:w-full',
                      'transition-colors duration-[120ms]',
                      selected ? 'text-ink-700' : 'text-paper-600 hover:bg-paper-100 hover:text-paper-900',
                    )}
                  >
                    {selected ? (
                      <motion.span
                        layoutId="hero-typology-indicator"
                        aria-hidden
                        className="absolute inset-0 rounded-sm border border-ink-100 bg-ink-50"
                        transition={reduce ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
                      />
                    ) : null}
                    <span aria-hidden className="relative">
                      <TypologyIcon typologyId={item.id} size={24} strokeWidth={2.75} />
                    </span>
                    <span className="relative">{item.label}</span>
                  </RadioGroup.Item>
                )
              })}
            </div>
          </RadioGroup.Root>
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-paper-200 px-4 py-4 lg:flex-col lg:items-stretch lg:gap-5 lg:py-5">
          <div className="flex w-full min-w-0 items-end gap-2 sm:w-auto lg:w-full">
            <MeasureField
              label="Ancho"
              value={raw.width}
              invalid={!widthValid}
              describedBy={hintId}
              onChange={(value) => onMeasureChange('width', value)}
              onKeyDown={(event) => onMeasureKey('width', event)}
              onBlur={onMeasureBlur}
            />
            <span aria-hidden className="pb-2.5 text-[18px] text-paper-350">
              ×
            </span>
            <MeasureField
              label="Alto"
              value={raw.height}
              invalid={!heightValid}
              describedBy={hintId}
              onChange={(value) => onMeasureChange('height', value)}
              onKeyDown={(event) => onMeasureKey('height', event)}
              onBlur={onMeasureBlur}
            />
          </div>

          {example && example.colors.length > 1 ? (
            <div className="ml-auto lg:ml-0">
              <p className="hidden pb-1.5 text-[12px] font-medium text-paper-600 lg:block">
                Color <span className="font-normal">· {example.color?.name}</span>
              </p>
              <RadioGroup.Root
                value={example.color?.id}
                onValueChange={setColorId}
                aria-label="Color"
                orientation="horizontal"
                loop
                className="-ml-1 flex items-center gap-1 pb-1 lg:pb-0"
              >
                {example.colors.map((color) => (
                  <RadioGroup.Item
                    key={color.id}
                    value={color.id}
                    aria-label={color.name}
                    title={color.name}
                    className="group/swatch relative grid size-9 place-items-center rounded-full"
                  >
                    <span
                      aria-hidden
                      className="size-6 rounded-full border border-black/15 transition-transform duration-[120ms] group-hover/swatch:scale-105"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span
                      aria-hidden
                      className="absolute inset-0.5 rounded-full border-2 border-transparent transition-colors duration-[120ms] group-data-[state=checked]/swatch:border-ink-600"
                    />
                  </RadioGroup.Item>
                ))}
              </RadioGroup.Root>
            </div>
          ) : null}

          <p id={hintId} aria-live="polite" className="w-full text-[12px] leading-4 text-paper-600">
            {typedValid ? (
              <span>
                Escribe ancho y alto en milímetros.
                <span className="hidden sm:inline"> Con las flechas ↑ ↓ ajustas de a 10 mm.</span>
              </span>
            ) : (
              <span className="text-warn-600">Para este ejemplo usa entre {limitsText}.</span>
            )}
          </p>
        </div>
      </div>

      {/* Lienzo y precio */}
      <div className="flex min-w-0 flex-col">
        <div className="relative flex-1">
          <svg aria-hidden className="pointer-events-none absolute inset-0 size-full text-paper-200">
            <defs>
              <pattern id="hero-grid-fine" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M12 0H0V12" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="0.5" />
              </pattern>
              <pattern id="hero-grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <rect width="60" height="60" fill="url(#hero-grid-fine)" />
                <path d="M60 0H0V60" fill="none" stroke="currentColor" strokeWidth="0.75" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-grid)" />
          </svg>
          <p className="absolute top-3 left-4 text-[11px] font-medium tracking-[0.02em] text-paper-600">
            Vista interior · cotas en mm
          </p>
          <div ref={canvasRef} className="relative h-[300px] px-4 pt-9 pb-3 sm:h-[380px] lg:h-full lg:min-h-[440px]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={typology}
                className="flex size-full items-center justify-center"
                initial={{ opacity: 0, scale: reduce ? 1 : 0.985 }}
                animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_IN } }}
              >
                <DrawingBoundary resetKey={drawingKey} fallback={<DrawingFallback />}>
                  {example ? (
                    <WindowDrawing
                      layout={example.layout}
                      design={example.design}
                      catalog={SAMPLE_CATALOG}
                      view="interior"
                      dimensions="all"
                      width={Math.max(200, canvas.width - 32)}
                      height={Math.max(160, canvas.height - 48)}
                    />
                  ) : (
                    <DrawingFallback />
                  )}
                </DrawingBoundary>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-paper-200 bg-paper-50 px-4 py-4 sm:flex-row sm:items-end sm:justify-between lg:px-5">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-paper-900">{TYPOLOGY_TITLE[typology]}</p>
            <p className="mt-0.5 truncate text-[13px] text-paper-600">
              {specLine || 'Catálogo de ejemplo'}
              <span className="tabular"> · {formatArea((size.width * size.height) / 1_000_000)}</span>
            </p>
          </div>
          <div className="flex items-end justify-between gap-6 sm:justify-end">
            <div className="text-left sm:text-right">
              <p className="text-[12px] text-paper-600">Precio de ejemplo</p>
              {price !== null ? (
                <p className="mt-0.5 text-[26px] leading-8 font-semibold tracking-[-0.01em] text-paper-900">
                  <AnimatedNumber value={price} format={formatClp} />
                  <span className="ml-1.5 text-[13px] font-medium tracking-normal text-paper-600">+ IVA</span>
                </p>
              ) : (
                <p className="mt-1 text-[14px] text-paper-600">Con tus precios, al crear tu cuenta</p>
              )}
            </div>
            <Link
              to="/crear-cuenta"
              className="group/cta inline-flex h-10 items-center gap-1.5 rounded-sm px-1 text-[14px] font-medium text-ink-600 hover:text-ink-700"
            >
              Cotizar la mía
              <ArrowRight
                aria-hidden
                strokeWidth={1.75}
                className="size-4 transition-transform duration-[160ms] ease-out group-hover/cta:translate-x-0.5"
              />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function toRaw(size: Size) {
  return { width: formatMm(size.width), height: formatMm(size.height) }
}

interface MeasureFieldProps {
  label: string
  value: string
  invalid: boolean
  describedBy: string
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onBlur: () => void
}

function MeasureField({ label, value, invalid, describedBy, onChange, onKeyDown, onBlur }: MeasureFieldProps) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none lg:flex-1">
      <label htmlFor={id} className="text-[12px] font-medium text-paper-600">
        {label}
      </label>
      <div
        className={clsx(
          'flex h-11 w-full items-center rounded-sm border bg-paper-0 pr-3 transition-colors duration-[120ms] sm:w-[132px] lg:w-full',
          'focus-within:border-ink-500 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink-500',
          invalid ? 'border-warn-600' : 'border-paper-350',
        )}
      >
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onFocus={(event) => event.currentTarget.select()}
          className="tabular h-full w-full min-w-0 bg-transparent pl-3 text-[20px] font-medium text-paper-900 outline-none focus-visible:outline-none"
        />
        <span aria-hidden className="text-[13px] text-paper-600">
          mm
        </span>
      </div>
    </div>
  )
}

function DrawingFallback() {
  return (
    <div className="flex flex-col items-center gap-2 text-center text-paper-600">
      <svg aria-hidden width="72" height="72" viewBox="0 0 72 72" fill="none" className="text-paper-350">
        <rect x="6" y="6" width="60" height="60" rx="3" stroke="currentColor" strokeWidth="3" />
        <rect x="14" y="14" width="44" height="44" stroke="currentColor" strokeWidth="1.25" />
        <line x1="28" y1="48" x2="44" y2="24" stroke="currentColor" strokeWidth="1" />
      </svg>
      <p className="text-[13px]">Estamos preparando el dibujo. Prueba con otras medidas.</p>
    </div>
  )
}
