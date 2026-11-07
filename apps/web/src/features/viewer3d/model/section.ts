/**
 * Secciones de perfil. Una sección es un contorno 2D en mm: `d` crece desde el borde exterior de la pieza
 * hacia el centro del hueco y `z` desde la cara exterior del marco hacia el interior. Se describe con
 * nodos (con radio de redondeo y oclusión opcionales) y se expande a tiras con normales: dentro de una
 * tira la luz corre continua; una arista viva corta la tira.
 *
 * Puro: no depende de three.js ni del navegador.
 */

export interface SectionNode {
  d: number
  z: number
  /** Radio de redondeo de esta esquina (mm). 0 = arista viva. */
  r?: number
  /** Oclusión horneada en este punto: 1 = a la vista, 0,4 = fondo de un rebaje. */
  ao?: number
}

export interface SectionVertex {
  d: number
  z: number
  /** Normal en el plano de la sección, hacia afuera del sólido. */
  nd: number
  nz: number
  /** Distancia recorrida por el contorno (mm): la `v` del foliado. */
  v: number
  ao: number
}

export type SectionStrip = SectionVertex[]

export interface Section {
  strips: SectionStrip[]
}

interface Expanded {
  d: number
  z: number
  ao: number
  hard: boolean
}

const EPS = 1e-6

function expand(nodes: SectionNode[], closed: boolean, arcSteps: number): Expanded[] {
  const n = nodes.length
  const out: Expanded[] = []
  nodes.forEach((node, i) => {
    const ao = node.ao ?? 1
    const prev = nodes[(i - 1 + n) % n]
    const next = nodes[(i + 1) % n]
    const atEnd = !closed && (i === 0 || i === n - 1)
    if (!node.r || atEnd) {
      out.push({ d: node.d, z: node.z, ao, hard: true })
      return
    }
    const ax = prev.d - node.d
    const ay = prev.z - node.z
    const bx = next.d - node.d
    const by = next.z - node.z
    const la = Math.hypot(ax, ay)
    const lb = Math.hypot(bx, by)
    if (la < EPS || lb < EPS) {
      out.push({ d: node.d, z: node.z, ao, hard: true })
      return
    }
    const ux = ax / la
    const uy = ay / la
    const vx = bx / lb
    const vy = by / lb
    const cos = Math.max(-1, Math.min(1, ux * vx + uy * vy))
    const angle = Math.acos(cos)
    if (angle > Math.PI - 0.01 || angle < 0.01) {
      out.push({ d: node.d, z: node.z, ao, hard: false })
      return
    }
    // Tangente limitada a un poco menos de la mitad de cada tramo: dos radios vecinos no se cruzan.
    const tangent = Math.min(node.r / Math.tan(angle / 2), la * 0.48, lb * 0.48)
    const radius = tangent * Math.tan(angle / 2)
    const bisX = ux + vx
    const bisY = uy + vy
    const bisLen = Math.hypot(bisX, bisY)
    const centerDist = radius / Math.sin(angle / 2)
    const cx = node.d + (bisX / bisLen) * centerDist
    const cy = node.z + (bisY / bisLen) * centerDist
    const p0x = node.d + ux * tangent
    const p0y = node.z + uy * tangent
    const p1x = node.d + vx * tangent
    const p1y = node.z + vy * tangent
    const a0 = Math.atan2(p0y - cy, p0x - cx)
    let sweep = Math.atan2(p1y - cy, p1x - cx) - a0
    while (sweep > Math.PI) sweep -= 2 * Math.PI
    while (sweep < -Math.PI) sweep += 2 * Math.PI
    for (let s = 0; s <= arcSteps; s++) {
      const a = a0 + (sweep * s) / arcSteps
      out.push({ d: cx + Math.cos(a) * radius, z: cy + Math.sin(a) * radius, ao, hard: false })
    }
  })
  return out
}

/** Expande nodos a tiras con normales. El contorno cerrado va en sentido antihorario en (d, z). */
export function buildSection(nodes: SectionNode[], options: { closed?: boolean; arcSteps?: number } = {}): Section {
  const closed = options.closed ?? true
  const pts = expand(nodes, closed, Math.max(1, options.arcSteps ?? 3))
  const count = pts.length
  if (count < 2) return { strips: [] }
  const segments = closed ? count : count - 1
  const normals: { nd: number; nz: number; len: number }[] = []
  for (let i = 0; i < segments; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % count]
    const dx = b.d - a.d
    const dy = b.z - a.z
    const len = Math.hypot(dx, dy) || 1e-9
    normals.push({ nd: dy / len, nz: -dx / len, len })
  }

  const strips: SectionStrip[] = []
  let start = 0
  if (closed) {
    const firstHard = pts.findIndex((p) => p.hard)
    start = firstHard >= 0 ? firstHard : 0
  }
  let v = 0
  let strip: SectionStrip = []
  const push = (segmentIn: number | null, segmentOut: number | null, p: Expanded) => {
    let nd = 0
    let nz = 0
    if (segmentIn !== null) {
      nd += normals[segmentIn].nd
      nz += normals[segmentIn].nz
    }
    if (segmentOut !== null) {
      nd += normals[segmentOut].nd
      nz += normals[segmentOut].nz
    }
    const len = Math.hypot(nd, nz) || 1
    strip.push({ d: p.d, z: p.z, nd: nd / len, nz: nz / len, v, ao: p.ao })
  }
  for (let k = 0; k < segments; k++) {
    const i = (start + k) % segments
    const j = (i + 1) % count
    if (strip.length === 0) push(null, i, pts[i])
    v += normals[i].len
    const nextPoint = pts[j]
    if (nextPoint.hard || k === segments - 1) {
      push(i, null, nextPoint)
      strips.push(strip)
      strip = []
    } else {
      push(i, j % segments, nextPoint)
    }
  }
  return { strips: strips.filter((item) => item.length > 1) }
}

/** Refleja la sección en profundidad (hoja que abre hacia afuera). Mantiene el sentido del contorno. */
export function flipNodes(nodes: SectionNode[], zSum: number): SectionNode[] {
  return nodes.map((node) => ({ ...node, z: zSum - node.z })).reverse()
}

/** Separa la sección en sus lados exterior e interior (bicolor), cortando por el punto medio de cada tramo. */
export function splitSection(section: Section, zMid: number): { exterior: Section; interior: Section } {
  const exterior: SectionStrip[] = []
  const interior: SectionStrip[] = []
  for (const strip of section.strips) {
    let run: SectionStrip = [strip[0]]
    let runExterior: boolean | null = null
    for (let i = 1; i < strip.length; i++) {
      const isExterior = (strip[i - 1].z + strip[i].z) / 2 < zMid
      if (runExterior === null) runExterior = isExterior
      if (isExterior !== runExterior) {
        ;(runExterior ? exterior : interior).push(run)
        run = [strip[i - 1]]
        runExterior = isExterior
      }
      run.push(strip[i])
    }
    ;(runExterior ? exterior : interior).push(run)
  }
  return { exterior: { strips: exterior }, interior: { strips: interior } }
}
