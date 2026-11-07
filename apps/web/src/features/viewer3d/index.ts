/**
 * Visor 3D de ventanas (plan Pro: el cliente la ve en 3D en el portal y el taller la revisa).
 *
 * Carga diferida recomendada (three.js pesa):
 *   const Window3D = lazy(() => import('./features/viewer3d'))            // export default
 *   import { Window3DLazy } from './features/viewer3d/lazy'                // con Suspense incluido
 *   const Viewer3DShowcase = lazy(() => import('./features/viewer3d/Viewer3DShowcase'))  // ruta /dev/3d
 */
export { Window3D, default } from './Window3D'
export { Viewer3DShowcase } from './Viewer3DShowcase'
export { Window3DLazy, Window3DWithAr, type Window3DWithArProps } from './lazy'
export { WindowArButton, type WindowArButtonProps } from './ar/WindowArButton'
export { arItemFromUrl, arShareUrl, decideArMode, type ArMode } from './ar/capability'
export { Viewer3DPlaceholder, Viewer3DUnavailable } from './Viewer3DMessage'
export { isWebGLAvailable } from './webgl'
export type { Viewer3DView, Window3DProps } from './types'
export { buildWindowModel, type BuildWindowModelInput, type WindowModel, type WindowModelPart } from './model/buildWindowModel'
