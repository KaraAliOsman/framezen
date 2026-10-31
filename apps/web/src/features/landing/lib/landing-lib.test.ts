import { PLANS } from '@framezen/shared'
import { describe, expect, it } from 'vitest'
import { BAR_LENGTH, DEMO_GROUPS, demoStats, KERF, layoutBar } from './cutDemo'
import { formatClp, formatDecimal, formatInt, formatMm, formatPct, parseMeasure } from './format'
import { landingPlans, maxSavingsPct, quotePlan, seatsLabel } from './plans'

describe('format', () => {
  it('formatea pesos, medidas y porcentajes en es-CL', () => {
    expect(formatClp(1234567)).toBe('$1.234.567')
    expect(formatInt(1200)).toBe('1.200')
    expect(formatMm(554.5)).toBe('554,5')
    expect(formatMm(1199)).toBe('1.199')
    expect(formatDecimal(96, 1)).toBe('96,0')
    expect(formatPct(96.134)).toBe('96,1 %')
  })

  it('lee medidas escritas de varias formas', () => {
    expect(parseMeasure('1200')).toEqual({ first: 1200, second: null })
    expect(parseMeasure('1.200 mm')).toEqual({ first: 1200, second: null })
    expect(parseMeasure('1200x1500')).toEqual({ first: 1200, second: 1500 })
    expect(parseMeasure('1.200 × 1.500')).toEqual({ first: 1200, second: 1500 })
    expect(parseMeasure('1200,5')).toEqual({ first: 1200.5, second: null })
    expect(parseMeasure('')).toEqual({ first: null, second: null })
    expect(parseMeasure('abc')).toEqual({ first: null, second: null })
  })
})

describe('planes', () => {
  it('muestra los 4 planes en orden y con el precio del periodo', () => {
    const monthly = landingPlans('monthly')
    expect(monthly.map((quote) => quote.plan.code)).toEqual(['taller', 'pro', 'empresa', 'empresa2x'])
    expect(monthly[1].perMonth).toBe(PLANS.pro.monthly)
    expect(landingPlans('yearly')[1].perMonth).toBe(PLANS.pro.yearlyMonthly)
    expect(monthly.filter((quote) => quote.plan.recommended).map((quote) => quote.plan.code)).toEqual(['pro'])
  })

  it('calcula total anual y ahorro', () => {
    const pro = quotePlan(PLANS.pro, 'yearly')
    expect(pro.yearlyTotal).toBe(PLANS.pro.yearlyMonthly * 12)
    expect(pro.yearlySavings).toBe((PLANS.pro.monthly - PLANS.pro.yearlyMonthly) * 12)
    expect(maxSavingsPct()).toBe(23)
  })

  it('nombra los asientos en lenguaje humano', () => {
    expect(seatsLabel(1)).toBe('1 persona')
    expect(seatsLabel(3)).toBe('Hasta 3 personas')
    expect(seatsLabel(null)).toBe('Personas ilimitadas')
  })
})

describe('ejemplo de optimización', () => {
  const multiset = (mode: 'perWindow' | 'optimized') =>
    DEMO_GROUPS.map((group) =>
      group.bars[mode]
        .flat()
        .map((cut) => `${cut.ref}-${cut.length}`)
        .sort()
        .join('|'),
    )

  it('cada barra cabe en 5.800 mm con el disco descontado', () => {
    for (const group of DEMO_GROUPS) {
      for (const mode of ['perWindow', 'optimized'] as const) {
        for (const cuts of group.bars[mode]) {
          const bar = layoutBar(cuts)
          expect(bar.used + bar.kerfLoss).toBeLessThanOrEqual(BAR_LENGTH)
          expect(bar.kerfLoss).toBe(cuts.length * KERF)
        }
      }
    }
  })

  it('ambas formas de cortar tienen exactamente las mismas piezas', () => {
    expect(multiset('optimized')).toEqual(multiset('perWindow'))
  })

  it('optimizar ahorra barras y mejora el aprovechamiento', () => {
    const perWindow = demoStats('perWindow')
    const optimized = demoStats('optimized')
    expect(perWindow.bars).toBe(7)
    expect(optimized.bars).toBe(5)
    expect(optimized.pieces).toBe(perWindow.pieces)
    expect(formatPct(optimized.yieldPct)).toBe('96,1 %')
  })
})
