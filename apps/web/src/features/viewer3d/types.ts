import type { Catalog, Layout, WindowDesign } from '@framezen/engine'

/** Desde qué lado se mira la ventana. La geometría del motor viene en vista interior. */
export type Viewer3DView = 'interior' | 'exterior'

export interface Window3DProps {
  /** Geometría a escala (salida de computeLayout). */
  layout: Layout
  /** Diseño de la ventana: línea (profundidad), colores y vidrio. */
  design: WindowDesign
  /** Catálogo con colores, líneas y vidrios. */
  catalog: Catalog
  /** Cuánto se abren las hojas: 0 = cerrada, 1 = abierta del todo. */
  openAmount?: number
  /** Balanceo lento de la cámara mientras nadie la toca. */
  autoRotate?: boolean
  view?: Viewer3DView
  className?: string
  /** Alto del visor (px o cualquier medida CSS). Por defecto 420 px. */
  height?: number | string
}
