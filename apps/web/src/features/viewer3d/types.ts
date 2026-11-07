import type { TextureSources } from '@dekopen/documents'
import type { Catalog, Layout, WindowDesign } from '@dekopen/engine'
import type { ReactNode } from 'react'

/** Desde qué lado se mira la ventana. La geometría del motor viene en vista interior. */
export type Viewer3DView = 'interior' | 'exterior'

export interface Window3DProps {
  /** Geometría a escala (salida de computeLayout). Un conjunto trae sus unidades en `layout.assembly`. */
  layout: Layout
  /** Diseño de la ventana: línea (profundidad), colores y vidrio. */
  design: WindowDesign
  /** Catálogo con colores, líneas y vidrios. */
  catalog: Catalog
  /** Cuánto se abren las hojas: 0 = cerrada, 1 = abierta del todo. Sin esto, el visor muestra su propio botón. */
  openAmount?: number
  /** Balanceo lento de la cámara mientras nadie la toca. */
  autoRotate?: boolean
  view?: Viewer3DView
  className?: string
  /** Alto del visor (px o cualquier medida CSS). Por defecto 420 px. */
  height?: number | string
  /** Texturas subidas (data URL de la API de texturas). Sin esto se usan las de `TextureProvider`. */
  textures?: TextureSources
  /** Acción sobre el visor, abajo a la derecha (el botón de realidad aumentada, por ejemplo). */
  overlay?: ReactNode
}
