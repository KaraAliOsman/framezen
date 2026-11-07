import { useRef, type Dispatch, type SetStateAction } from 'react'
import type { CutSettings } from '@dekopen/engine'
import type { OrgSettings } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { useUpdateSettings } from '../../../lib/hooks'
import { useT } from '../../../lib/i18n'
import { toast, toastUndo } from '../../../ui'
import es from '../i18n/es'
import type { CutField, CutSimulation } from './CutsTab'

function stripBar(sim: Partial<CutSettings>): Partial<CutSettings> {
  const { barLength: _bar, ...rest } = sim
  return rest
}

function dominantBarOf(input: { data: { optimization: { groups: { bars: { barLength: number; fromOffcut: boolean }[] }[] } } } | null): number {
  const counts = new Map<number, number>()
  for (const g of input?.data.optimization.groups ?? []) for (const b of g.bars) if (!b.fromOffcut) counts.set(b.barLength, (counts.get(b.barLength) ?? 0) + 1)
  let best = 5800
  let max = -1
  for (const [len, n] of counts) if (n > max) [best, max] = [len, n]
  return best
}

/** Simulación de los ajustes de corte (no se guarda salvo que lo pidas), en una OT o una cotización. */
export function useCutSimulation({
  sim,
  setSim,
  settings,
  input,
  readOnly,
}: {
  sim: Partial<CutSettings>
  setSim: Dispatch<SetStateAction<Partial<CutSettings>>>
  settings: OrgSettings | undefined
  input: Parameters<typeof dominantBarOf>[0]
  readOnly: boolean
}): CutSimulation | null {
  const t = useT(es)
  const updateSettings = useUpdateSettings()
  // Largo de barra «natural» (el del catálogo, sin simular) para saber cuándo vuelves a él.
  const naturalBar = useRef(settings?.cut.barLength ?? 5800)
  if (sim.barLength === undefined && input) naturalBar.current = dominantBarOf(input)
  if (!settings) return null
  const baseCut: CutSettings = { ...settings.cut }
  return {
    values: sim,
    effective: { ...baseCut, ...stripBar(sim), barLength: sim.barLength ?? naturalBar.current },
    set: (field: CutField, value: number | null) =>
      setSim((prev) => {
        const next = { ...prev }
        const original = field === 'barLength' ? naturalBar.current : baseCut[field]
        if (value === null || value === original) delete next[field]
        else next[field] = value
        return next
      }),
    reset: () => setSim({}),
    saveDefault: readOnly
      ? undefined
      : () => {
          const previous = settings.cut
          const nextCut = { ...previous, ...stripBar(sim) }
          updateSettings.mutate(
            { cut: nextCut },
            {
              onSuccess: () => {
                setSim((s) => (s.barLength !== undefined ? { barLength: s.barLength } : {}))
                toastUndo(t('order.cutSaved'), () => updateSettings.mutate({ cut: previous }))
              },
              onError: (error) => toast.error(humanError(error)),
            },
          )
        },
    saving: updateSettings.isPending,
  }
}
