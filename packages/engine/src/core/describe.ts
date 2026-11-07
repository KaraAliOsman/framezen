import type { Catalog, DesignNode, Opening, ShapeKind, TypologyId, WindowDesign } from '../types'
import { assemblyUnits, isAssembly } from './assembly'
import { formatNumber } from './format'
import { openingDirection } from './pauta'
import { isSemicircularArch } from './shapes'
import { pivotRatio } from './specs'
import { childrenOf, collectLeaves, panelsOf } from './tree'
import { TYPOLOGIES } from './typologies'

/** Nombre corto de una apertura: «Abatible», «Proyectante», «Puerta de acceso»… */
export function openingLabel(opening: Opening, detail = false): string {
  const out = openingDirection(opening) === 'out'
  const use = opening?.use
  let label: string
  switch (opening?.kind) {
    case 'casement':
      label = use === 'balcony' || use === 'entrance' ? doorUseLabel(use, out) : out ? 'Abatible exterior' : 'Abatible'
      break
    case 'tilt_turn':
      label = use === 'balcony' || use === 'entrance' ? `${doorUseLabel(use, false)} oscilobatiente` : 'Oscilobatiente'
      break
    case 'tilt':
      label = 'Oscilante'
      break
    case 'awning':
      label = 'Proyectante'
      break
    case 'door':
      label = use === 'balcony' || use === 'entrance' ? doorUseLabel(use, out) : out ? 'Puerta exterior' : 'Puerta'
      break
    case 'pivot_v':
      label = 'Pivotante vertical'
      break
    case 'pivot_h':
      label = 'Pivotante horizontal'
      break
    case 'tilt_slide':
      label = 'Osciloparalela'
      break
    case 'parallel_slide':
      label = 'Corredera paralela'
      break
    case 'folding':
      label = 'Plegable'
      break
    default:
      label = 'Fijo'
  }
  if (!detail || !opening) return label
  const side = (s: 'left' | 'right') => (s === 'left' ? 'izquierda' : 'derecha')
  if (opening.hinge && (opening.kind === 'casement' || opening.kind === 'tilt_turn' || opening.kind === 'door')) {
    label += `, bisagras a la ${side(opening.hinge)} (vista interior)`
  }
  if (opening.kind === 'tilt_turn' && opening.sequence === 'tilt_first') label += ', oscila primero'
  if ((opening.kind === 'tilt_slide' || opening.kind === 'parallel_slide') && opening.slide) {
    label += `, se desliza a la ${side(opening.slide)} (vista interior)`
  }
  if (opening.kind === 'folding' && opening.hinge) label += `, se pliega a la ${side(opening.hinge)} (vista interior)`
  if (opening.kind === 'pivot_v' || opening.kind === 'pivot_h') {
    const r = pivotRatio(opening)
    label += Math.abs(r - 0.5) < 0.005 ? ', eje centrado' : `, eje al ${formatNumber(r * 100, 0)} % ${opening.kind === 'pivot_v' ? 'desde la izquierda' : 'desde arriba'}`
  }
  return label
}

function doorUseLabel(use: 'balcony' | 'entrance', out: boolean): string {
  const base = use === 'balcony' ? 'Puerta balconera' : 'Puerta de acceso'
  return out ? `${base} exterior` : base
}

/** Firma de la forma: el arco distingue medio punto («semi») de rebajado («seg»). */
function shapeSignature(design: Pick<WindowDesign, 'shape' | 'width'>): string {
  const shape = design.shape
  if (!shape || shape.kind === 'rect') return 'rect'
  if (shape.kind === 'arch') return isSemicircularArch(shape.rise, design.width) ? 'arch:semi' : 'arch:seg'
  return shape.kind
}

/**
 * Firma estructural (sin medidas, ids ni bisagras) para reconocer tipologías. Tolera árboles
 * incompletos (el servidor solo valida root.type): lo que no es un nodo reconocible firma «∅».
 * Una hoja firma su apertura, el sentido (abatibles y puertas) y su uso (balconera, acceso); una
 * unión francesa con hoja pasiva declarada firma «frp»; un plegable «fo»; una elevadora «S…h».
 */
function signature(node: DesignNode | undefined): string {
  if (typeof node !== 'object' || node === null) return '∅'
  if (node.type === 'leaf') {
    const kind = node.opening?.kind ?? 'fixed'
    const dir = kind === 'casement' || kind === 'door' ? `:${openingDirection(node.opening)}` : ''
    const use = node.opening?.use === 'balcony' || node.opening?.use === 'entrance' ? `@${node.opening.use}` : ''
    const fill = node.fill === 'panel' || node.fill === 'louver' ? `|${node.fill}` : ''
    const zocalo = node.zocalo ? '|z' : ''
    return `L(${kind}${dir}${use}${fill}${zocalo})`
  }
  if (node.type === 'sliding') {
    const system = node.system === 'lift_slide' ? 'h' : node.system === 'vertical' ? 'v' : ''
    return `S${node.rails}${system}(${panelsOf(node).map((p) => (p?.kind === 'fixed' ? 'f' : 'm')).join('')})`
  }
  if (node.type !== 'split') return '∅'
  const joint = node.joint === 'french' ? (node.passive === 'left' || node.passive === 'right' ? 'frp' : 'fr') : node.joint === 'fold' ? 'fo' : 'mu'
  return `${node.dir === 'vertical' ? 'V' : 'H'}:${joint}[${childrenOf(node).map(signature).join(',')}]`
}

/** Firma sin la hoja pasiva declarada ni el relleno: una puerta con panel sigue siendo esa puerta. */
const relaxed = (sig: string): string => sig.replace(/:frp\[/g, ':fr[').replace(/\|(panel|louver|z)/g, '')

/**
 * Tipología de la galería que corresponde al diseño, si la hay (ignora medidas, bisagras, ejes y
 * sentidos de deslizamiento). Primero busca la firma exacta; si no, la misma sin la hoja pasiva
 * declarada (una «Puerta 2 hojas» con pasiva elegida sigue siendo «Puerta 2 hojas»).
 */
export function matchTypology(design: WindowDesign): TypologyId | undefined {
  if (typeof design?.root !== 'object' || design.root === null || isAssembly(design)) return undefined
  const sig = signature(design.root)
  const shape = shapeSignature(design)
  const candidates = TYPOLOGIES.map((t) => {
    const w = design.width || t.defaultSize.width
    const built = t.build(w, design.height || t.defaultSize.height)
    return { id: t.id, shape: shapeSignature({ shape: built.shape, width: w }), sig: signature(built.root) }
  }).filter((c) => c.shape === shape)
  const exact = candidates.find((c) => c.sig === sig)
  if (exact) return exact.id
  const loose = relaxed(sig)
  return candidates.find((c) => relaxed(c.sig) === loose)?.id
}

const SHAPE_NAMES: Record<Exclude<ShapeKind, 'rect'>, string> = {
  arch: 'Arco',
  trapezoid: 'Forma irregular',
  triangle: 'Triángulo',
  round: 'Redonda',
  oval: 'Ovalada',
  pentagon: 'Pentágono',
  octagon: 'Octógono',
  gable: 'Frontón',
}

/** Nombre humano del diseño: el de su tipología o uno compuesto («Fijo + abatible + fijo»). */
export function designName(design: WindowDesign): string {
  if (isAssembly(design)) return assemblyName(design)
  const id = matchTypology(design)
  if (id) return TYPOLOGIES.find((t) => t.id === id)?.name ?? 'Ventana'
  const root = design?.root
  if (typeof root !== 'object' || root === null) return 'Ventana'
  if (root.type === 'sliding') {
    const n = panelsOf(root).length
    const lift = root.system === 'lift_slide'
    if (root.system === 'vertical') return panelsOf(root).every((p) => p?.kind !== 'fixed') ? 'Guillotina doble' : 'Guillotina'
    const family = lift ? 'Corredera elevadora' : 'Corredera'
    const base =
      root.rails === 1 && !lift ? 'Corredera monorriel' : n === 0 ? family : `${family} ${n} ${n === 1 ? 'hoja' : 'hojas'}`
    return root.rails === 3 && n !== 3 ? `${base}, 3 rieles` : base
  }
  const shape = design.shape?.kind
  const shapeName =
    shape === 'arch' && !isSemicircularArch(design.shape?.kind === 'arch' ? design.shape.rise : 0, design.width)
      ? 'Arco rebajado'
      : shape && shape !== 'rect'
        ? SHAPE_NAMES[shape]
        : ''
  const leaves = collectLeaves(root)
  const labels = leaves.map((l) => openingLabel(l.opening ?? { kind: 'fixed' }))
  let name: string
  if (leaves.length === 0) name = 'Ventana'
  else if (root.type === 'split' && root.joint === 'fold' && leaves.length > 1 && leaves.every((l) => l.opening?.kind === 'folding')) {
    name = `Plegable ${leaves.length} hojas`
  } else if (leaves.length === 1) name = labels[0] === 'Fijo' ? 'Paño fijo' : labels[0]
  else if (leaves.length <= 4) name = labels.map((l, i) => (i === 0 ? l : l.toLowerCase())).join(' + ')
  else name = `Ventana de ${leaves.length} paños`
  return shapeName ? `${shapeName} · ${name.toLowerCase()}` : name
}

/** «Bay window, 3 paños», «Ventana en esquina», «Conjunto de 3 ventanas». */
function assemblyName(design: WindowDesign): string {
  const n = assemblyUnits(design).length
  switch (design.assembly?.kind) {
    case 'bay':
      return `Bay window, ${n} paños`
    case 'bow':
      return `Bow window, ${n} paños`
    case 'corner':
      return 'Ventana en esquina'
    default:
      return `Conjunto de ${n} ventanas`
  }
}

/** Lista sin repetir, en orden: lo común se dice una vez («PRO6004 y PRO7005»). */
function distinct(values: (string | undefined)[]): string {
  const list = [...new Set(values.filter((v): v is string => !!v))]
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`
}

/** «Corredera 2 hojas · PROSLD70 · Blanco · DVH 4+12+4». Omite lo que falte en el catálogo. */
export function describeDesign(design: WindowDesign, catalog: Catalog): string {
  if (isAssembly(design)) {
    const units = assemblyUnits(design).map((u) => u.design)
    const lines = distinct(units.map((u) => catalog?.lines?.find((l) => l.id === u.lineId)?.name))
    const colors = distinct(units.map((u) => catalog?.colors?.find((c) => c.id === u.colorId)?.name))
    const glass = distinct(units.map((u) => catalog?.glass?.find((g) => g.id === u.glassId)?.name))
    return [designName(design), lines, colors, glass].filter(Boolean).join(' · ')
  }
  const line = catalog?.lines?.find((l) => l.id === design?.lineId)
  const colors = catalog?.colors ?? []
  const ext = colors.find((c) => c.id === design?.colorId)?.name
  const int = design?.colorInId ? colors.find((c) => c.id === design.colorInId)?.name : undefined
  const color = ext && int && int !== ext ? `${ext} exterior / ${int} interior` : ext
  const glass = catalog?.glass?.find((g) => g.id === design?.glassId)?.name
  return [designName(design), line?.name, color, glass].filter(Boolean).join(' · ')
}
