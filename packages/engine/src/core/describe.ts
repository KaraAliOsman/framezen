import type { Catalog, DesignNode, Opening, TypologyId, WindowDesign } from '../types'
import { openingDirection } from './pauta'
import { childrenOf, collectLeaves, panelsOf } from './tree'
import { TYPOLOGIES } from './typologies'

/** Nombre corto de una apertura: «Abatible», «Proyectante», «Puerta»… */
export function openingLabel(opening: Opening, detail = false): string {
  const out = openingDirection(opening) === 'out'
  let label: string
  switch (opening?.kind) {
    case 'casement':
      label = out ? 'Abatible exterior' : 'Abatible'
      break
    case 'tilt_turn':
      label = 'Oscilobatiente'
      break
    case 'tilt':
      label = 'Oscilante'
      break
    case 'awning':
      label = 'Proyectante'
      break
    case 'door':
      label = out ? 'Puerta exterior' : 'Puerta'
      break
    default:
      label = 'Fijo'
  }
  if (detail && opening?.hinge && (opening.kind === 'casement' || opening.kind === 'tilt_turn' || opening.kind === 'door')) {
    label += `, bisagras a la ${opening.hinge === 'left' ? 'izquierda' : 'derecha'} (vista interior)`
  }
  return label
}

/**
 * Firma estructural (sin medidas, ids ni bisagras) para reconocer tipologías. Tolera árboles
 * incompletos (el servidor solo valida root.type): lo que no es un nodo reconocible firma «∅».
 */
function signature(node: DesignNode | undefined): string {
  if (typeof node !== 'object' || node === null) return '∅'
  if (node.type === 'leaf') {
    const kind = node.opening?.kind ?? 'fixed'
    const dir = kind === 'casement' || kind === 'door' ? `:${openingDirection(node.opening)}` : ''
    return `L(${kind}${dir})`
  }
  if (node.type === 'sliding') return `S${node.rails}(${panelsOf(node).map((p) => (p?.kind === 'fixed' ? 'f' : 'm')).join('')})`
  if (node.type !== 'split') return '∅'
  const joint = node.joint === 'french' ? 'fr' : 'mu'
  return `${node.dir === 'vertical' ? 'V' : 'H'}:${joint}[${childrenOf(node).map(signature).join(',')}]`
}

/** Tipología de la galería que corresponde al diseño, si la hay (ignora medidas y bisagras). */
export function matchTypology(design: WindowDesign): TypologyId | undefined {
  if (typeof design?.root !== 'object' || design.root === null) return undefined
  const sig = signature(design.root)
  const shapeKind = design.shape?.kind ?? 'rect'
  for (const t of TYPOLOGIES) {
    const built = t.build(design.width || t.defaultSize.width, design.height || t.defaultSize.height)
    if ((built.shape?.kind ?? 'rect') === shapeKind && signature(built.root) === sig) return t.id
  }
  return undefined
}

/** Nombre humano del diseño: el de su tipología o uno compuesto («Fijo + abatible + fijo»). */
export function designName(design: WindowDesign): string {
  const id = matchTypology(design)
  if (id) return TYPOLOGIES.find((t) => t.id === id)?.name ?? 'Ventana'
  const root = design?.root
  if (typeof root !== 'object' || root === null) return 'Ventana'
  if (root.type === 'sliding') {
    const n = panelsOf(root).length
    const base =
      root.rails === 1 ? 'Corredera monorriel' : n === 0 ? 'Corredera' : `Corredera ${n} ${n === 1 ? 'hoja' : 'hojas'}`
    return root.rails === 3 && n !== 3 ? `${base}, 3 rieles` : base
  }
  const shape = design.shape?.kind
  const shapeName = shape === 'arch' ? 'Arco' : shape === 'trapezoid' ? 'Forma irregular' : shape === 'triangle' ? 'Triángulo' : ''
  const leaves = collectLeaves(root)
  const labels = leaves.map((l) => openingLabel(l.opening ?? { kind: 'fixed' }))
  let name: string
  if (leaves.length === 0) name = 'Ventana'
  else if (leaves.length === 1) name = labels[0] === 'Fijo' ? 'Paño fijo' : labels[0]
  else if (leaves.length <= 4) name = labels.map((l, i) => (i === 0 ? l : l.toLowerCase())).join(' + ')
  else name = `Ventana de ${leaves.length} paños`
  return shapeName ? `${shapeName} · ${name.toLowerCase()}` : name
}

/** «Corredera 2 hojas · PROSLD70 · Blanco · DVH 4+12+4». Omite lo que falte en el catálogo. */
export function describeDesign(design: WindowDesign, catalog: Catalog): string {
  const line = catalog?.lines?.find((l) => l.id === design?.lineId)
  const colors = catalog?.colors ?? []
  const ext = colors.find((c) => c.id === design?.colorId)?.name
  const int = design?.colorInId ? colors.find((c) => c.id === design.colorInId)?.name : undefined
  const color = ext && int && int !== ext ? `${ext} exterior / ${int} interior` : ext
  const glass = catalog?.glass?.find((g) => g.id === design?.glassId)?.name
  return [designName(design), line?.name, color, glass].filter(Boolean).join(' · ')
}
