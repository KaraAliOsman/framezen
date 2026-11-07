/** Cuánto le pide el visor al equipo. Un teléfono de gama media no debe pagar lo mismo que un escritorio. */
export interface ViewerTier {
  name: 'phone' | 'desktop'
  dpr: [number, number]
  shadowMap: number
  contactShadow: number
  /** Ancho del mapa HDR; el reflejo más nítido del vidrio mide un cuarto de esto por cara de cubo. */
  environment: number
}

const PHONE: ViewerTier = { name: 'phone', dpr: [1, 1.75], shadowMap: 1024, contactShadow: 256, environment: 512 }
const DESKTOP: ViewerTier = { name: 'desktop', dpr: [1, 2], shadowMap: 2048, contactShadow: 512, environment: 1024 }

interface DeviceHints {
  coarsePointer: boolean
  memoryGb?: number
  cores?: number
  shortSide: number
}

export function tierFor({ coarsePointer, memoryGb, cores, shortSide }: DeviceHints): ViewerTier {
  const weak = (memoryGb !== undefined && memoryGb <= 4) || (cores !== undefined && cores <= 4)
  return weak || (coarsePointer && shortSide < 820) ? PHONE : DESKTOP
}

export function detectViewerTier(): ViewerTier {
  if (typeof window === 'undefined') return DESKTOP
  const nav = navigator as Navigator & { deviceMemory?: number }
  return tierFor({
    coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    memoryGb: nav.deviceMemory,
    cores: nav.hardwareConcurrency || undefined,
    shortSide: Math.min(window.innerWidth, window.innerHeight),
  })
}
