import { BufferAttribute, BufferGeometry, CylinderGeometry, ExtrudeGeometry, LatheGeometry, Shape, Vector2 } from 'three'
import { mergeAndDispose, roundedRectPoints } from './geometry'

/**
 * Herrajes modelados, en mm: manilla con collarín y palanca de sección elíptica, placa de puerta con
 * cilindro, bisagras de canuto con sus alas, tirador de corredera y palanca de elevadora. Son piezas de
 * proporción común, sin imitar a ningún fabricante; el color lo decide `hardwareTone`, como en el 2D.
 */

/** Sección elíptica recorrida por una curva: tubo de ancho y alto variables. */
function loft(stations: { y: number; z: number; w: number; h: number }[], sides: number): BufferGeometry {
  const rows = stations.length
  const position = new Float32Array(rows * sides * 3)
  const uv = new Float32Array(rows * sides * 2)
  const index: number[] = []
  for (let r = 0; r < rows; r++) {
    const s = stations[r]
    const a = stations[Math.max(0, r - 1)]
    const b = stations[Math.min(rows - 1, r + 1)]
    const ty = b.y - a.y
    const tz = b.z - a.z
    const len = Math.hypot(ty, tz) || 1
    // Normal de la curva en el plano YZ; el ancho corre por X.
    const ny = -tz / len
    const nz = ty / len
    for (let c = 0; c < sides; c++) {
      const angle = (c / sides) * Math.PI * 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const i = (r * sides + c) * 3
      position[i] = (cos * s.w) / 2
      position[i + 1] = s.y + (sin * s.h * ny) / 2
      position[i + 2] = s.z + (sin * s.h * nz) / 2
      uv[(r * sides + c) * 2] = r / (rows - 1)
      uv[(r * sides + c) * 2 + 1] = c / sides
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < sides; c++) {
      const a = r * sides + c
      const b = r * sides + ((c + 1) % sides)
      const d = (r + 1) * sides + c
      const e = (r + 1) * sides + ((c + 1) % sides)
      index.push(a, b, e, a, e, d)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Palanca de manilla: nace en el collarín (z = 0), sube por el cuello y corre hacia −Y con la punta
 * levemente levantada; se afina tras el cuello y se ensancha hacia la punta redondeada.
 */
export function leverGeometry(length: number, sides = 12): BufferGeometry | null {
  const stations: { y: number; z: number; w: number; h: number }[] = []
  const rise = 25
  // Tramos parejos y, en la punta, más seguidos: ahí la sección se cierra en redondo.
  const samples = [...Array.from({ length: 17 }, (_, i) => (i / 16) * 0.9), 0.93, 0.955, 0.975, 0.99, 1]
  for (const t of samples) {
    let y: number
    let z: number
    if (t < 0.3) {
      // Cuello: un cuarto de vuelta suave de la vertical a la horizontal.
      const a = (t / 0.3) * (Math.PI / 2)
      y = -(1 - Math.cos(a)) * 15
      z = Math.sin(a) * rise
    } else {
      const k = (t - 0.3) / 0.7
      y = -15 - k * (length - 15)
      z = rise + Math.sin(k * Math.PI * 0.5) * 3
    }
    const tip = t > 0.9 ? Math.sqrt(Math.max(0.0001, 1 - ((t - 0.9) / 0.1) ** 2)) : 1
    const grip = t < 0.3 ? 15 - ease(t / 0.3) * 1.5 : 13.5 + ease((t - 0.3) / 0.7) * 5.5
    const body = t < 0.3 ? 15 - ease(t / 0.3) * 5 : 10 + ease((t - 0.3) / 0.7) * 1
    stations.push({ y, z, w: Math.max(0.2, grip * tip), h: Math.max(0.2, body * tip) })
  }
  const lever = loft(stations, sides)
  const collar = latheProfile([
    [0, 0],
    [15.5, 0],
    [16, 1.2],
    [15, 5],
    [12.5, 6.5],
    [0, 6.5],
  ])
  return mergeAndDispose([lever, collar])
}

/** Sólido de revolución alrededor de Z desde (radio, altura). */
function latheProfile(points: [number, number][], segments = 20): BufferGeometry {
  const lathe = new LatheGeometry(
    points.map(([radius, height]) => new Vector2(radius, height)),
    segments,
  )
  lathe.rotateX(Math.PI / 2)
  return lathe
}

function slab(width: number, height: number, radius: number, thickness: number, bevel: number, segments = 3): BufferGeometry {
  const shape = new Shape(roundedRectPoints(width - 2 * bevel, height - 2 * bevel, Math.max(0.5, radius - bevel)))
  const geometry = new ExtrudeGeometry(shape, { depth: Math.max(0.2, thickness - bevel), bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: segments, curveSegments: 4 })
  // Las caras internas del bisel quedan contra el perfil: la base se apoya en z = 0.
  geometry.translate(0, 0, bevel)
  return geometry
}

/** Roseta de manilla: `lying` la acuesta para los cantos superior e inferior. */
export function rosetteGeometry(lying: boolean): BufferGeometry {
  return lying ? slab(76, 30, 8, 7, 2) : slab(30, 76, 8, 7, 2)
}

/** Placa de puerta larga con cilindro de seguridad bajo la manilla. */
export function doorPlateGeometry(): { plate: BufferGeometry; cylinder: BufferGeometry } {
  const plate = slab(42, 236, 9, 7, 2.2)
  plate.translate(0, -38, 0)
  const ring = latheProfile([
    [0, 7],
    [13, 7],
    [14, 8],
    [13.5, 9.5],
    [11, 10],
    [0, 10],
  ])
  ring.translate(0, -112, 0)
  const key = slab(9, 22, 3, 1, 0.3, 1)
  key.translate(0, -113, 9.6)
  const cylinder = mergeAndDispose([ring, key])
  return { plate, cylinder: cylinder ?? new BufferGeometry() }
}

/** Tirador de corredera: placa angosta con una toma saliente. */
export function pullGeometry(height: number): BufferGeometry | null {
  const plate = slab(34, height, 8, 5, 1.6)
  const grip = slab(20, height * 0.72, 8, 16, 4, 4)
  grip.translate(0, 0, 3)
  return mergeAndDispose([plate, grip])
}

export interface HingeGeometries {
  fixed: BufferGeometry
  moving: BufferGeometry
}

/**
 * Bisagra de canuto sobre el eje de giro (Y local, origen en el eje): el canuto del marco abajo y el de la
 * hoja arriba, con una junta fina entre ambos y remates biselados.
 */
export function hingeGeometries(length: number, radius: number): HingeGeometries {
  const half = length / 2
  const barrel = (y0: number, y1: number) => {
    const body = new CylinderGeometry(radius, radius, y1 - y0, 16, 1, false)
    body.translate(0, (y0 + y1) / 2, 0)
    const tip = new CylinderGeometry(radius * 0.72, radius, 1.5, 16, 1, false)
    if (y0 < 0) tip.rotateX(Math.PI)
    tip.translate(0, y0 < 0 ? y0 - 0.75 : y1 + 0.75, 0)
    return [body, tip]
  }
  const fixed = mergeAndDispose(barrel(-half, -0.4)) ?? new BufferGeometry()
  const moving = mergeAndDispose(barrel(0.4, half)) ?? new BufferGeometry()
  return { fixed, moving }
}

/** Tapa de drenaje: pieza plana con ranura, centrada en el origen y apoyada en z = 0. */
export function weepCapGeometry(): BufferGeometry | null {
  return slab(32, 9, 3, 2.4, 0.9, 2)
}
