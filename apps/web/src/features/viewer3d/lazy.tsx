import { lazy, Suspense } from 'react'
import { WindowArButton, type WindowArButtonProps } from './ar/WindowArButton'
import type { Window3DProps } from './types'
import { Viewer3DPlaceholder } from './Viewer3DMessage'

const Window3DImpl = lazy(() => import('./Window3D'))

/**
 * Visor 3D con carga diferida: este archivo es liviano y three.js se descarga solo
 * cuando el visor se monta.
 */
export function Window3DLazy(props: Window3DProps) {
  return (
    <Suspense fallback={<Viewer3DPlaceholder className={props.className} height={props.height} />}>
      <Window3DImpl {...props} />
    </Suspense>
  )
}

export interface Window3DWithArProps extends Window3DProps {
  /** Opciones del botón de realidad aumentada (título, enlace del QR, publicación del GLB). */
  ar?: Pick<WindowArButtonProps, 'title' | 'pageUrl' | 'itemId' | 'hostGlb' | 'placement'>
}

/**
 * Listo para el portal: el visor con su botón "Ver en tu espacio" encima. El botón elige solo el camino
 * según el equipo (ver `ar/capability.ts`) y desaparece si no hay ninguno.
 */
export function Window3DWithAr({ ar, ...props }: Window3DWithArProps) {
  const { layout, design, catalog, textures } = props
  return <Window3DLazy {...props} overlay={<WindowArButton layout={layout} design={design} catalog={catalog} textures={textures} {...ar} />} />
}

export default Window3DLazy
