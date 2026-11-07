/**
 * Íconos propios de DEKOPEN para el rubro PVC. Misma construcción que lucide (retícula de 24, 2 px de
 * margen, trazo redondeado, radio 1,5–2), así conviven en una barra con `lucide-react` y aceptan sus
 * props (size, strokeWidth, className…). Tipo `LucideIcon`: valen para `Button icon={…}`.
 *
 * Convención de aperturas (vista interior): líneas desde las esquinas del lado de cierre hasta el centro
 * del lado de bisagras; continua si abre hacia quien mira, discontinua si se aleja.
 */
import { createLucideIcon, type LucideIcon } from 'lucide-react'

type Node = Parameters<typeof createLucideIcon>[1]

const dashed = { strokeDasharray: '2.25 2' }

function icon(name: string, node: Array<[string, Record<string, string | number>]>): LucideIcon {
  return createLucideIcon(
    `dk-${name}`,
    node.map(([tag, attrs], i) => [tag, { ...attrs, key: `${name}-${i}` }]) as Node,
  )
}

/** Marco vertical de ventana (4 × 3 → 20 × 21). */
const portrait = ['rect', { x: 4, y: 3, width: 16, height: 18, rx: 1.5 }] as [string, Record<string, number>]
/** Marco apaisado (corredera, plegable). */
const landscape = ['rect', { x: 3, y: 5, width: 18, height: 14, rx: 1.5 }] as [string, Record<string, number>]

// ── Piezas ──────────────────────────────────────────────────────────────────────────────────

/** Marco con ingletes verdaderos en las cuatro esquinas. */
export const IconFrame = icon('frame', [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['rect', { x: 7.5, y: 7.5, width: 9, height: 9, rx: 0.5 }],
  ['path', { d: 'M3.6 3.6 7.5 7.5' }],
  ['path', { d: 'M20.4 3.6 16.5 7.5' }],
  ['path', { d: 'M3.6 20.4 7.5 16.5' }],
  ['path', { d: 'M20.4 20.4 16.5 16.5' }],
])

/** Hoja dentro del marco, con manilla. */
export const IconSash = icon('sash', [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['rect', { x: 6.5, y: 6.5, width: 11, height: 11, rx: 1 }],
  ['path', { d: 'M15 10.5v3' }],
])

/** Montante vertical (perfil intermedio). */
export const IconMullion = icon('mullion', [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M10.75 3v18' }],
  ['path', { d: 'M13.25 3v18' }],
])

/** Travesaño horizontal (paño superior). */
export const IconTransom = icon('transom', [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M3 8.75h18' }],
  ['path', { d: 'M3 11.25h18' }],
])

/** Vidrio: paño con reflejo. */
export const IconGlass = icon('glass', [
  ['rect', { x: 4, y: 3, width: 16, height: 18, rx: 1.5 }],
  ['path', { d: 'm14.5 7-5.5 5.5' }],
  ['path', { d: 'm16 10.5-3 3' }],
])

/** Doble vidriado hermético (DVH) en sección: dos vidrios, separador arriba y abajo. */
export const IconGlazing = icon('glazing', [
  ['path', { d: 'M7 3v18' }],
  ['path', { d: 'M17 3v18' }],
  ['rect', { x: 7, y: 5, width: 10, height: 2.5, rx: 0.5 }],
  ['rect', { x: 7, y: 16.5, width: 10, height: 2.5, rx: 0.5 }],
])

/** Manilla de ventana (roseta + palanca hacia abajo, cerrada). */
export const IconHandle = icon('handle', [
  ['rect', { x: 9, y: 2.5, width: 6, height: 9, rx: 3 }],
  ['circle', { cx: 12, cy: 6.5, r: 1 }],
  ['rect', { x: 10.5, y: 10, width: 3, height: 11.5, rx: 1.5 }],
])

/** Bisagra: dos alas y el nudo. */
export const IconHinge = icon('hinge', [
  ['rect', { x: 10.5, y: 3, width: 3, height: 18, rx: 1.5 }],
  ['path', { d: 'M10.5 5.5H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h5.5' }],
  ['path', { d: 'M13.5 5.5H19a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-5.5' }],
  ['path', { d: 'M10.5 9h3' }],
  ['path', { d: 'M10.5 15h3' }],
])

/** Foliado / textura de madera: veta con un nudo. */
export const IconFoil = icon('foil', [
  ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
  ['path', { d: 'M3 8c3 0 4-1.5 7-1.5S16 8 21 8' }],
  ['path', { d: 'M3 16c4 0 5-1.5 8-1.5s5 1.5 10 1.5' }],
  ['path', { d: 'M9.5 11.5c1.6-1.4 3.9-1.4 5.5 0-1.6 1.4-3.9 1.4-5.5 0Z' }],
])

/** Perfil en sección: cámaras y refuerzo de acero. */
export const IconProfileSection = icon('profile-section', [
  ['path', { d: 'M4 4a1 1 0 0 1 1-1h6v4h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z' }],
  ['path', { d: 'M4 11h16' }],
  ['path', { d: 'M9 11v10' }],
  ['path', { d: 'M15 11v10' }],
  ['rect', { x: 10.75, y: 13.5, width: 2.5, height: 5, rx: 0.5 }],
])

/** Huincha de medir. */
export const IconTapeMeasure = icon('tape-measure', [
  ['rect', { x: 2.5, y: 5, width: 13, height: 13, rx: 3 }],
  ['circle', { cx: 9, cy: 11.5, r: 2.5 }],
  ['path', { d: 'M15.5 15h6v3' }],
  ['path', { d: 'M18 15v1.5' }],
  ['path', { d: 'M20 15v1.5' }],
])

/** Cota: línea con remates y flechas. */
export const IconDimension = icon('dimension', [
  ['path', { d: 'M4 6v12' }],
  ['path', { d: 'M20 6v12' }],
  ['path', { d: 'M4 12h16' }],
  ['path', { d: 'm7 9-3 3 3 3' }],
  ['path', { d: 'm17 9 3 3-3 3' }],
])

/** Alféizar / vierteaguas bajo la ventana. */
export const IconSill = icon('sill', [
  ['rect', { x: 5, y: 3, width: 14, height: 14, rx: 1.5 }],
  ['path', { d: 'M5 10h14' }],
  ['path', { d: 'M3 19.5h18l-1.5 2h-15Z' }],
])

// ── Aperturas ───────────────────────────────────────────────────────────────────────────────

/** Abatible (bisagras a la izquierda, manilla a la derecha). */
export const IconOpeningCasement = icon('opening-casement', [portrait, ['path', { d: 'M17.5 5.5 6.5 12l11 6.5' }]])

/** Oscilante (bisagras abajo, abre hacia adentro arriba). */
export const IconOpeningTilt = icon('opening-tilt', [portrait, ['path', { d: 'M6.5 5.5 12 18.5l5.5-13' }]])

/** Proyectante (bisagras arriba, abre hacia afuera: discontinua). */
export const IconOpeningAwning = icon('opening-awning', [portrait, ['path', { d: 'M6.5 18.5 12 5.5l5.5 13', ...dashed }]])

/** Oscilobatiente: abatible + oscilante. */
export const IconOpeningTiltTurn = icon('opening-tilt-turn', [
  portrait,
  ['path', { d: 'M17.5 5.5 6.5 12l11 6.5' }],
  ['path', { d: 'M6.5 5.5 12 18.5l5.5-13' }],
])

/** Corredera de dos hojas (traslapo al centro). */
export const IconOpeningSliding = icon('opening-sliding', [
  landscape,
  ['path', { d: 'M11 5v14' }],
  ['path', { d: 'M13 5v14' }],
  ['path', { d: 'M5.5 12H9' }],
  ['path', { d: 'm7.5 10.5 1.5 1.5-1.5 1.5' }],
  ['path', { d: 'M18.5 12H15' }],
  ['path', { d: 'M16.5 10.5 15 12l1.5 1.5' }],
])

/** Elevable deslizante (HST): sube y desliza. */
export const IconOpeningLiftSlide = icon('opening-lift-slide', [
  landscape,
  ['path', { d: 'M12 5v14' }],
  ['path', { d: 'M18 16v-5h-6.5' }],
  ['path', { d: 'm13.5 9-2 2 2 2' }],
  ['path', { d: 'M5.5 16.5h3' }],
])

/** Oscilo-paralela (PSK): bascula y desliza en paralelo. */
export const IconOpeningTiltSlide = icon('opening-tilt-slide', [
  landscape,
  ['path', { d: 'M12 5v14' }],
  ['path', { d: 'M13.5 7 16.25 14 19 7' }],
  ['path', { d: 'M19 16.75h-5' }],
  ['path', { d: 'M15.5 15.25 14 16.75l1.5 1.5' }],
])

/** Paralela deslizante: la hoja se separa y desliza. */
export const IconOpeningParallelSlide = icon('opening-parallel-slide', [
  landscape,
  ['path', { d: 'M12 5v14' }],
  ['rect', { x: 14, y: 7.5, width: 5, height: 9, rx: 0.5, ...dashed }],
  ['path', { d: 'M10 12H5.5' }],
  ['path', { d: 'm7 10.5-1.5 1.5L7 13.5' }],
])

/** Paño fijo (vidrio con reflejo dentro del marco). */
export const IconOpeningFixed = icon('opening-fixed', [
  portrait,
  ['rect', { x: 7, y: 6, width: 10, height: 12, rx: 0.5 }],
  ['path', { d: 'm14 9-4 4' }],
])

/** Pivotante vertical: eje discontinuo al centro, la mitad derecha se aleja. */
export const IconOpeningPivot = icon('opening-pivot', [
  portrait,
  ['path', { d: 'M12 3v18', ...dashed }],
  ['path', { d: 'M6.5 6 12 12l-5.5 6' }],
  ['path', { d: 'M17.5 6 12 12l5.5 6', ...dashed }],
])

/** Pivotante horizontal: eje horizontal, la mitad inferior se aleja. */
export const IconOpeningPivotHorizontal = icon('opening-pivot-horizontal', [
  portrait,
  ['path', { d: 'M4 12h16', ...dashed }],
  ['path', { d: 'M6.5 5.5 12 12l5.5-6.5' }],
  ['path', { d: 'M6.5 18.5 12 12l5.5 6.5', ...dashed }],
])

/** Plegable (fuelle, vista en planta bajo el riel). */
export const IconOpeningFolding = icon('opening-folding', [
  ['path', { d: 'M3 5h18' }],
  ['path', { d: 'M3 3v4' }],
  ['path', { d: 'M21 3v4' }],
  ['path', { d: 'm4.5 8 3.75 11L12 8l3.75 11L19.5 8' }],
])

/** Puerta (hoja con manilla y umbral). */
export const IconDoor = icon('door', [
  ['path', { d: 'M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17' }],
  ['path', { d: 'M3.5 21h17' }],
  ['rect', { x: 8.5, y: 5.5, width: 7, height: 7, rx: 0.5 }],
  ['path', { d: 'M15 14.5v2.5' }],
])

/** Ventana de arco (medio punto). */
export const IconArch = icon('arch', [
  ['path', { d: 'M5 21V10a7 7 0 0 1 14 0v11Z' }],
  ['path', { d: 'M5 13h14' }],
  ['path', { d: 'M12 3v10' }],
])

// ── Accesorios ──────────────────────────────────────────────────────────────────────────────

/** Persiana enrollable: cajón, guías y lamas. */
export const IconRollerShutter = icon('roller-shutter', [
  ['rect', { x: 3, y: 3, width: 18, height: 4.5, rx: 1 }],
  ['path', { d: 'M5 7.5V21' }],
  ['path', { d: 'M19 7.5V21' }],
  ['path', { d: 'M5 11h14' }],
  ['path', { d: 'M5 14.5h14' }],
  ['path', { d: 'M5 18h14' }],
])

/** Mosquitero: marco con malla. */
export const IconInsectScreen = icon('insect-screen', [
  portrait,
  ['path', { d: 'M4 9.5 10.5 3' }],
  ['path', { d: 'M4 15.5 16.5 3' }],
  ['path', { d: 'M5.5 20 20 5.5' }],
  ['path', { d: 'M11.5 21 20 12.5' }],
  ['path', { d: 'M17.5 21l2.5-2.5' }],
])

// ── Taller y documentos ─────────────────────────────────────────────────────────────────────

/** Sierra ingletadora (taller). */
export const IconMiterSaw = icon('miter-saw', [
  ['circle', { cx: 12, cy: 10, r: 6.5 }],
  ['circle', { cx: 12, cy: 10, r: 1.5 }],
  ['path', { d: 'M12 3.5v-1' }],
  ['path', { d: 'M18.5 10h1' }],
  ['path', { d: 'M4.5 10h1' }],
  ['path', { d: 'M3 21h18' }],
  ['path', { d: 'M6 21v-2.5h6.5L15 21' }],
])

/** Barras con cortes a inglete (lista de cortes / optimización). */
export const IconCutBars = icon('cut-bars', [
  ['path', { d: 'M3 4h13l-2 3H3Z' }],
  ['path', { d: 'M3 10.5h18l-2 3H3Z' }],
  ['path', { d: 'M3 17h8l-2 3H3Z' }],
  ['path', { d: 'M15 17h6v3h-8Z' }],
])

/** Plantilla de documento (cabecera + bloques). */
export const IconTemplate = icon('template', [
  ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
  ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
  ['path', { d: 'M8 9h4' }],
  ['rect', { x: 8, y: 12, width: 8, height: 4, rx: 0.5 }],
  ['path', { d: 'M8 19h8' }],
])

/** Cotización: documento con la ventana dibujada y la línea del total. */
export const IconQuoteDocument = icon('quote-document', [
  ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
  ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
  ['rect', { x: 7.5, y: 9.5, width: 5, height: 6, rx: 0.5 }],
  ['path', { d: 'M10 9.5v6' }],
  ['path', { d: 'M14.5 11h2' }],
  ['path', { d: 'M14.5 14h2' }],
  ['path', { d: 'M12 18.5h4.5' }],
])
