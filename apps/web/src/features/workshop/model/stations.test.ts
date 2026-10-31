import { describe, expect, it } from 'vitest'
import {
  isStation,
  itemProgress,
  nextStation,
  orderProgress,
  previousStation,
  progressText,
  slowestStation,
  STATION_IDS,
  stationIndex,
  stationOf,
  statusFromProgress,
} from './stations'

describe('estaciones', () => {
  it('orden del taller: Corte → … → Instalado', () => {
    expect(STATION_IDS).toEqual(['cut', 'weld', 'assembly', 'hardware', 'glazing', 'qc', 'ready', 'installed'])
    expect(nextStation('cut')).toBe('weld')
    expect(nextStation('ready')).toBe('installed')
    expect(nextStation('installed')).toBeNull()
    expect(previousStation('cut')).toBeNull()
    expect(previousStation('weld')).toBe('cut')
    expect(isStation('glazing')).toBe(true)
    expect(isStation('pintura')).toBe(false)
  })

  it('una ref sin avance guardado está en Corte', () => {
    expect(stationOf({ V1: 'weld' }, 'V1')).toBe('weld')
    expect(stationOf({ V1: 'weld' }, 'V9')).toBe('cut')
    expect(stationOf(undefined, 'V1')).toBe('cut')
    expect(stationIndex(undefined)).toBe(0)
  })

  it('Listo es 100 % de avance de taller; Instalado también', () => {
    expect(itemProgress('cut')).toBe(0)
    expect(itemProgress('ready')).toBe(1)
    expect(itemProgress('installed')).toBe(1)
    expect(itemProgress('glazing')).toBeCloseTo(4 / 6)
  })

  it('avance de la OT por ventana y ponderado por unidades', () => {
    const progress = { V1: 'ready', V2: 'cut' } as const
    expect(orderProgress(progress).ratio).toBe(0.5)
    // V2 tiene 3 unidades: pesa más.
    expect(orderProgress(progress, ['V1', 'V2'], { V1: 1, V2: 3 }).ratio).toBe(0.25)
    // Las refs de la cotización mandan: V3 no tiene avance y cuenta como Corte.
    const p = orderProgress(progress, ['V1', 'V2', 'V3'])
    expect(p.total).toBe(3)
    expect(p.ready).toBe(1)
    expect(p.byStation.cut).toBe(2)
    expect(orderProgress({}).ratio).toBe(0)
  })

  it('avance en palabras', () => {
    expect(progressText(orderProgress({ V1: 'ready', V2: 'weld' }))).toBe('1 de 2 listas')
    expect(progressText(orderProgress({ V1: 'installed', V2: 'weld' }))).toBe('1 de 2 listas · 1 instalada')
    expect(progressText(orderProgress({ V1: 'ready', V2: 'installed' }))).toBe('Todas listas para instalar')
    expect(progressText(orderProgress({ V1: 'installed' }))).toBe('Instalada')
    expect(progressText(orderProgress({}))).toBe('Sin ventanas')
    expect(slowestStation({ V1: 'qc', V2: 'weld' })).toBe('weld')
  })

  it('estado como el servidor', () => {
    expect(statusFromProgress({ V1: 'cut', V2: 'cut' })).toBe('open')
    expect(statusFromProgress({ V1: 'weld', V2: 'cut' })).toBe('in_progress')
    expect(statusFromProgress({ V1: 'ready', V2: 'installed' })).toBe('done')
  })
})
