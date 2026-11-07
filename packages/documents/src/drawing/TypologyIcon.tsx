import type { ReactNode } from 'react'
import type { TypologyId } from '@dekopen/engine'

/**
 * Pictogramas propios para la galería de tipologías. Trazo en currentColor para
 * heredar el color del contexto (lista, botón seleccionado, modo oscuro).
 */

type Leaf = { t: 'leaf'; o: 'fixed' | 'turn' | 'tiltturn' | 'tilt' | 'awning' | 'door' | 'pivotv' | 'pivoth' | 'psk' | 'ps' | 'fold' | 'louver' | 'blind'; zocalo?: boolean; hinge?: 'l' | 'r'; out?: boolean }
type Split = { t: 'split'; dir: 'v' | 'h'; sizes?: number[]; children: IconNode[]; french?: boolean; fold?: boolean; vslide?: ('f' | 'd' | 'u')[] }
type Slide = { t: 'slide'; panels: ('l' | 'r' | 'f')[]; rails: 1 | 2 | 3; lift?: boolean }
type IconNode = Leaf | Split | Slide

interface IconSpec {
  /** Ancho / alto. */
  aspect: number
  shape?: 'arch' | 'trapezoid' | 'triangle' | 'round' | 'oval' | 'pentagon' | 'octagon' | 'gable'
  /** Arco: flecha como fracción del ancho (0,5 = medio punto; menos = arco rebajado). */
  rise?: number
  /** Forma con una hoja bajo el arco (imposta + hoja). */
  lower?: IconNode
  root: IconNode
}

const leaf = (o: Leaf['o'], hinge?: Leaf['hinge'], out?: boolean): Leaf => ({ t: 'leaf', o, hinge, out })
/** Puerta con banda ciega abajo. */
const zocaloDoor = (hinge: Leaf['hinge']): Leaf => ({ t: 'leaf', o: 'door', hinge, zocalo: true })
/** Guillotina: dos paños apilados con flecha vertical en los que se mueven. */
const vertical = (top: 'f' | 'd', bottom: 'u'): Split => ({ t: 'split', dir: 'h', vslide: [top, bottom], children: [leaf('fixed'), leaf('fixed')] })
const vsplit = (children: IconNode[], sizes?: number[], french?: boolean): Split => ({ t: 'split', dir: 'v', children, sizes, french })
/** Plegable: hojas iguales unidas por bisagras, dibujadas con la línea en zigzag. */
const fold = (n: number): Split => ({ t: 'split', dir: 'v', children: Array.from({ length: n }, () => leaf('fold')), french: true, fold: true })
const hsplit = (children: IconNode[], sizes?: number[]): Split => ({ t: 'split', dir: 'h', children, sizes })
const slide = (panels: Slide['panels'], rails: Slide['rails'] = 2, lift = false): Slide => ({ t: 'slide', panels, rails, lift })

export const TYPOLOGY_ICON_SPECS: Record<TypologyId, IconSpec> = {
  fixed: { aspect: 1, root: leaf('fixed') },
  casement: { aspect: 0.78, root: leaf('turn', 'l') },
  casement_out: { aspect: 0.78, root: leaf('turn', 'l', true) },
  tilt_turn: { aspect: 0.78, root: leaf('tiltturn', 'l') },
  tilt: { aspect: 1.45, root: leaf('tilt') },
  awning: { aspect: 1.45, root: leaf('awning', undefined, true) },
  casement_double: { aspect: 1.2, root: vsplit([leaf('turn', 'l'), leaf('turn', 'r')], undefined, true) },
  fixed_casement: { aspect: 1.3, root: vsplit([leaf('fixed'), leaf('turn', 'r')]) },
  fixed_tilt_turn: { aspect: 1.3, root: vsplit([leaf('fixed'), leaf('tiltturn', 'r')]) },
  casement_transom: { aspect: 0.74, root: hsplit([leaf('fixed'), leaf('turn', 'l')], [0.3, 0.7]) },
  fixed_awning_bottom: { aspect: 0.9, root: hsplit([leaf('fixed'), leaf('awning', undefined, true)], [0.64, 0.36]) },
  fixed_3: { aspect: 1.8, root: vsplit([leaf('fixed'), leaf('fixed'), leaf('fixed')]) },
  casement_fixed_casement: { aspect: 1.8, root: vsplit([leaf('turn', 'l'), leaf('fixed'), leaf('turn', 'r')]) },
  door: { aspect: 0.46, root: leaf('door', 'l') },
  door_double: { aspect: 0.78, root: vsplit([leaf('door', 'l'), leaf('door', 'r')], undefined, true) },
  door_sidelight: { aspect: 0.66, root: vsplit([leaf('door', 'l'), leaf('fixed')], [0.66, 0.34]) },
  door_transom: { aspect: 0.44, root: hsplit([leaf('fixed'), leaf('door', 'l')], [0.2, 0.8]) },
  arch: { aspect: 1, shape: 'arch', rise: 0.5, root: leaf('fixed') },
  trapezoid: { aspect: 1, shape: 'trapezoid', root: leaf('fixed') },
  triangle: { aspect: 1.3, shape: 'triangle', root: leaf('fixed') },
  sliding_2: { aspect: 1.5, root: slide(['r', 'l']) },
  sliding_2_fixed: { aspect: 1.5, root: slide(['f', 'l']) },
  sliding_3: { aspect: 1.8, root: slide(['r', 'l', 'l']) },
  sliding_3_rail: { aspect: 1.8, root: slide(['r', 'l', 'l'], 3) },
  sliding_4: { aspect: 2, root: slide(['f', 'l', 'r', 'f']) },
  sliding_mono: { aspect: 1.5, root: slide(['f', 'l'], 1) },
  // v5 (motor): pictogramas provisorios con los trazos existentes; DRAW los reemplaza en la ola 1.
  sliding_6: { aspect: 2.4, root: slide(['f', 'l', 'l', 'r', 'r', 'f'], 3) },
  sliding_3_center_fixed: { aspect: 1.8, root: slide(['r', 'f', 'l']) },
  sliding_4_center_fixed: { aspect: 2, root: slide(['r', 'f', 'f', 'l']) },
  lift_slide_2: { aspect: 1.4, root: slide(['f', 'l'], 2, true) },
  lift_slide_3: { aspect: 1.8, root: slide(['f', 'l', 'l'], 3, true) },
  lift_slide_4: { aspect: 2.4, root: slide(['f', 'l', 'r', 'f'], 2, true) },
  tilt_slide: { aspect: 1.1, root: vsplit([leaf('fixed'), leaf('psk')]) },
  tilt_slide_2: { aspect: 2, root: vsplit([leaf('fixed'), leaf('psk'), leaf('psk', 'r'), leaf('fixed')]) },
  parallel_slide: { aspect: 1.1, root: vsplit([leaf('fixed'), leaf('ps')]) },
  folding_3: { aspect: 1.2, root: fold(3) },
  folding_4: { aspect: 1.45, root: fold(4) },
  folding_5: { aspect: 1.8, root: fold(5) },
  folding_6: { aspect: 2.2, root: fold(6) },
  folding_7: { aspect: 2.5, root: fold(7) },
  pivot_v: { aspect: 0.7, root: leaf('pivotv') },
  pivot_h: { aspect: 1, root: leaf('pivoth') },
  french_casement: { aspect: 1.2, root: vsplit([leaf('turn', 'l'), leaf('turn', 'r')], undefined, true) },
  french_tilt_turn: { aspect: 1.1, root: vsplit([leaf('turn', 'l'), leaf('tiltturn', 'r')], undefined, true) },
  balcony_door: { aspect: 0.46, root: leaf('door', 'l') },
  balcony_door_double: { aspect: 0.78, root: vsplit([leaf('door', 'l'), leaf('door', 'r')], undefined, true) },
  entrance_door: { aspect: 0.5, root: leaf('door', 'l') },
  entrance_door_sidelights: { aspect: 1, root: vsplit([leaf('fixed'), leaf('door', 'l'), leaf('fixed')], [0.25, 0.5, 0.25]) },
  door_double_sidelights: { aspect: 1.3, root: vsplit([leaf('fixed'), vsplit([leaf('door', 'l'), leaf('door', 'r')], undefined, true), leaf('fixed')], [0.22, 0.56, 0.22]) },
  fixed_tilt_turn_fixed: { aspect: 1.8, root: vsplit([leaf('fixed'), leaf('tiltturn', 'l'), leaf('fixed')]) },
  tilt_turn_double_transom: { aspect: 0.8, root: hsplit([leaf('fixed'), vsplit([leaf('tiltturn', 'l'), leaf('tiltturn', 'r')])], [0.24, 0.76]) },
  round: { aspect: 1, shape: 'round', root: leaf('fixed') },
  oval: { aspect: 1.5, shape: 'oval', root: leaf('fixed') },
  pentagon: { aspect: 1, shape: 'pentagon', root: leaf('fixed') },
  octagon: { aspect: 1, shape: 'octagon', root: leaf('fixed') },
  gable: { aspect: 0.75, shape: 'gable', root: leaf('fixed') },
  arch_segmental: { aspect: 1.1, shape: 'arch', rise: 0.2, root: leaf('fixed') },
  arch_casement: { aspect: 0.62, shape: 'arch', rise: 0.5, lower: leaf('turn', 'l'), root: leaf('fixed') },
  // v7
  casement_bottom_fixed: { aspect: 0.56, root: hsplit([leaf('turn', 'l'), leaf('fixed')], [0.72, 0.28]) },
  tilt_turn_bottom_fixed: { aspect: 0.52, root: hsplit([leaf('tiltturn', 'l'), leaf('fixed')], [0.74, 0.26]) },
  casement_double_bottom_fixed: { aspect: 0.8, root: hsplit([vsplit([leaf('turn', 'l'), leaf('turn', 'r')], undefined, true), leaf('fixed')], [0.74, 0.26]) },
  tilt_turn_transom: { aspect: 0.56, root: hsplit([leaf('fixed'), leaf('tiltturn', 'l')], [0.24, 0.76]) },
  awning_transom: { aspect: 0.74, root: hsplit([leaf('awning', undefined, true), leaf('fixed')], [0.36, 0.64]) },
  fixed_tilt: { aspect: 0.7, root: hsplit([leaf('tilt'), leaf('fixed')], [0.28, 0.72]) },
  fixed_awning_side: { aspect: 1.5, root: vsplit([leaf('fixed'), leaf('awning', undefined, true)]) },
  casement_double_mullion: { aspect: 1.2, root: vsplit([leaf('turn', 'l'), leaf('turn', 'r')]) },
  tilt_turn_fixed_tilt_turn: { aspect: 1.6, root: vsplit([leaf('tiltturn', 'l'), leaf('fixed'), leaf('tiltturn', 'r')]) },
  door_panel: { aspect: 0.46, root: leaf('blind', 'l') },
  door_zocalo: { aspect: 0.46, root: zocaloDoor('l') },
  door_double_zocalo: { aspect: 0.78, root: vsplit([zocaloDoor('l'), zocaloDoor('r')], undefined, true) },
  door_out: { aspect: 0.46, root: leaf('door', 'l', true) },
  vertical_sliding: { aspect: 0.62, root: vertical('f', 'u') },
  vertical_sliding_double: { aspect: 0.62, root: vertical('d', 'u') },
  louver_fixed: { aspect: 1, root: leaf('louver') },
}

/** Nombres comerciales por defecto de cada tipología (para la galería y los catálogos). */
export const TYPOLOGY_ICON_LABELS: Record<TypologyId, string> = {
  fixed: 'Paño fijo',
  casement: 'Abatible',
  casement_out: 'Abatible exterior',
  tilt_turn: 'Oscilobatiente',
  tilt: 'Oscilante',
  awning: 'Proyectante',
  casement_double: 'Abatible doble',
  fixed_casement: 'Fijo + abatible',
  fixed_tilt_turn: 'Fijo + oscilobatiente',
  casement_transom: 'Abatible con sobreluz',
  fixed_awning_bottom: 'Fijo con proyectante',
  fixed_3: 'Tres paños fijos',
  casement_fixed_casement: 'Abatible, fijo y abatible',
  door: 'Puerta',
  door_double: 'Puerta doble',
  door_sidelight: 'Puerta con lateral fijo',
  door_transom: 'Puerta con sobreluz',
  arch: 'Medio punto',
  trapezoid: 'Fijo irregular',
  triangle: 'Fijo triangular',
  sliding_2: 'Corredera 2 hojas',
  sliding_2_fixed: 'Corredera con fijo',
  sliding_3: 'Corredera 3 hojas',
  sliding_3_rail: 'Corredera 3 rieles',
  sliding_4: 'Corredera 4 hojas',
  sliding_mono: 'Corredera monorriel',
  // v5: mismo texto que `name` en el motor.
  sliding_6: 'Corredera 6 hojas',
  sliding_3_center_fixed: 'Corredera 3 hojas, central fija',
  sliding_4_center_fixed: 'Corredera 4 hojas, centrales fijas',
  lift_slide_2: 'Corredera elevadora 2 hojas',
  lift_slide_3: 'Corredera elevadora 3 hojas',
  lift_slide_4: 'Corredera elevadora 4 hojas',
  tilt_slide: 'Osciloparalela',
  tilt_slide_2: 'Osciloparalela 2 hojas',
  parallel_slide: 'Corredera paralela',
  folding_3: 'Plegable 3 hojas',
  folding_4: 'Plegable 4 hojas',
  folding_5: 'Plegable 5 hojas',
  folding_6: 'Plegable 6 hojas',
  folding_7: 'Plegable 7 hojas',
  pivot_v: 'Pivotante vertical',
  pivot_h: 'Pivotante horizontal',
  french_casement: 'Francesa abatible',
  french_tilt_turn: 'Francesa oscilobatiente',
  balcony_door: 'Puerta balconera',
  balcony_door_double: 'Puerta balconera 2 hojas',
  entrance_door: 'Puerta de acceso',
  entrance_door_sidelights: 'Puerta de acceso con fijos laterales',
  door_double_sidelights: 'Puerta 2 hojas con fijos laterales',
  fixed_tilt_turn_fixed: 'Fijo + oscilobatiente + fijo',
  tilt_turn_double_transom: 'Oscilobatiente 2 hojas con sobreluz',
  round: 'Fijo redondo',
  oval: 'Fijo ovalado',
  pentagon: 'Fijo pentagonal',
  octagon: 'Fijo octogonal',
  gable: 'Fijo a dos aguas',
  arch_segmental: 'Arco rebajado',
  arch_casement: 'Medio punto con abatible',
  casement_bottom_fixed: 'Abatible con paño inferior',
  tilt_turn_bottom_fixed: 'Oscilobatiente con paño inferior',
  casement_double_bottom_fixed: 'Abatible 2 hojas con paño inferior',
  tilt_turn_transom: 'Oscilobatiente con sobreluz',
  awning_transom: 'Proyectante arriba con fijo',
  fixed_tilt: 'Fijo con oscilante arriba',
  fixed_awning_side: 'Fijo + proyectante lateral',
  casement_double_mullion: 'Abatible 2 hojas con parante',
  tilt_turn_fixed_tilt_turn: 'Oscilobatiente + fijo + oscilobatiente',
  door_panel: 'Puerta ciega',
  door_zocalo: 'Puerta con zócalo',
  door_double_zocalo: 'Puerta 2 hojas con zócalo',
  door_out: 'Puerta hacia afuera',
  vertical_sliding: 'Guillotina',
  vertical_sliding_double: 'Guillotina doble',
  louver_fixed: 'Celosía fija',
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

function rect(b: Box, props: Record<string, unknown> = {}, key?: string): ReactNode {
  return <rect key={key} x={r2(b.x)} y={r2(b.y)} width={r2(b.w)} height={r2(b.h)} {...props} />
}

function renderNode(node: IconNode, b: Box, out: ReactNode[], key: string, sw: number) {
  const thin = sw * 0.7
  if (node.t === 'split') {
    const n = node.children.length
    const sizes = node.sizes && node.sizes.length === n ? node.sizes : Array.from({ length: n }, () => 1 / n)
    let offset = 0
    node.children.forEach((child, i) => {
      const f = sizes[i]
      const cb = node.dir === 'v' ? { x: b.x + b.w * offset, y: b.y, w: b.w * f, h: b.h } : { x: b.x, y: b.y + b.h * offset, w: b.w, h: b.h * f }
      if (i > 0) {
        const d = node.dir === 'v' ? `M${r2(cb.x)} ${r2(b.y)}V${r2(b.y + b.h)}` : `M${r2(b.x)} ${r2(cb.y)}H${r2(b.x + b.w)}`
        out.push(<path key={`${key}-sep${i}`} d={d} strokeWidth={node.french ? thin : sw} />)
      }
      offset += f
      renderNode(child, cb, out, `${key}-${i}`, sw)
      const motion = node.vslide?.[i]
      if (motion === 'u' || motion === 'd') {
        // Guillotina: flecha vertical en la hoja que se mueve.
        const cx = cb.x + cb.w / 2
        const span = cb.h * 0.28
        const [from, to] = motion === 'u' ? [cb.y + cb.h / 2 + span, cb.y + cb.h / 2 - span] : [cb.y + cb.h / 2 - span, cb.y + cb.h / 2 + span]
        const s = motion === 'u' ? 1 : -1
        const hd = Math.min(3, cb.w * 0.14)
        out.push(<path key={`${key}-va${i}`} d={`M${r2(cx)} ${r2(from)}V${r2(to)}M${r2(cx - hd * 0.8)} ${r2(to + s * hd)}L${r2(cx)} ${r2(to)}L${r2(cx + hd * 0.8)} ${r2(to + s * hd)}`} strokeWidth={thin} strokeOpacity={0.85} />)
      }
    })
    if (node.fold) {
      // Notación de plegable: una sola línea en zigzag de arriba a abajo por todas las hojas.
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const x = b.x + b.w * sizes.slice(0, i).reduce((a, c) => a + c, 0)
        return `${r2(x)} ${r2(i % 2 === 0 ? b.y + b.h : b.y)}`
      })
      out.push(<path key={`${key}-zig`} d={`M${pts.join('L')}`} strokeWidth={thin} strokeOpacity={0.85} />)
    }
    return
  }
  if (node.t === 'slide') {
    const n = node.panels.length
    const overlap = node.rails > 1 ? b.w * 0.04 : 0
    const pw = (b.w + overlap * (n - 1)) / n
    node.panels.forEach((p, i) => {
      const x = b.x + i * (pw - overlap)
      const lift = node.rails > 1 ? (i % node.rails) * 1.1 : 0
      const pb = { x, y: b.y + lift, w: pw, h: b.h - lift }
      out.push(rect(pb, { fill: 'currentColor', fillOpacity: 0.06, strokeWidth: thin }, `${key}-p${i}`))
      const inner = { x: pb.x + 2, y: pb.y + 2, w: pb.w - 4, h: pb.h - 4 }
      if (n <= 4) out.push(rect(inner, { strokeWidth: thin * 0.8, strokeOpacity: 0.6 }, `${key}-pi${i}`))
      const cy = inner.y + inner.h / 2
      if (p === 'f') {
        const fs = Math.min(inner.w, inner.h) * 0.42
        out.push(
          <text key={`${key}-f${i}`} x={r2(inner.x + inner.w / 2)} y={r2(cy + fs * 0.36)} fontSize={r2(fs)} textAnchor="middle" fill="currentColor" stroke="none" fontWeight={600} fillOpacity={0.75} fontFamily="inherit">
            F
          </text>,
        )
      } else {
        const a = inner.x + inner.w * 0.22
        const z = inner.x + inner.w * 0.78
        const [from, to] = p === 'r' ? [a, z] : [z, a]
        const s = p === 'r' ? -1 : 1
        const hd = Math.min(3, inner.w * 0.14)
        // Elevadora (HST): la flecha arranca con un trazo hacia arriba (la hoja se levanta antes de correr).
        const liftTick = node.lift ? `M${r2(from)} ${r2(cy)}V${r2(cy - hd * 1.7)}` : ''
        out.push(<path key={`${key}-a${i}`} d={`M${r2(from)} ${r2(cy)}H${r2(to)}M${r2(to + s * hd)} ${r2(cy - hd * 0.8)}L${r2(to)} ${r2(cy)}L${r2(to + s * hd)} ${r2(cy + hd * 0.8)}${liftTick}`} strokeWidth={thin} strokeOpacity={0.85} />)
      }
    })
    return
  }
  // Hoja o paño fijo.
  const sashed = node.o !== 'fixed' && node.o !== 'louver'
  const g = sashed ? { x: b.x + 2.2, y: b.y + 2.2, w: b.w - 4.4, h: b.h - 4.4 } : b
  out.push(rect(g, { fill: 'currentColor', fillOpacity: 0.07, stroke: 'none' }, `${key}-g`))
  if (sashed) out.push(rect(g, { strokeWidth: thin }, `${key}-s`))
  const x0 = g.x
  const x1 = g.x + g.w
  const y0 = g.y
  const y1 = g.y + g.h
  const xm = g.x + g.w / 2
  const ym = g.y + g.h / 2
  const turn = node.hinge === 'r' ? `M${r2(x0)} ${r2(y0)}L${r2(x1)} ${r2(ym)}L${r2(x0)} ${r2(y1)}` : `M${r2(x1)} ${r2(y0)}L${r2(x0)} ${r2(ym)}L${r2(x1)} ${r2(y1)}`
  const tilt = `M${r2(x0)} ${r2(y0)}L${r2(xm)} ${r2(y1)}L${r2(x1)} ${r2(y0)}`
  const awning = `M${r2(x0)} ${r2(y1)}L${r2(xm)} ${r2(y0)}L${r2(x1)} ${r2(y1)}`
  // Flecha horizontal de deslizamiento (osciloparalela y paralela) y ejes de pivote.
  const ad = Math.min(3, g.w * 0.14)
  const [ax0, ax1] = node.hinge === 'r' ? [x0 + g.w * 0.25, x1 - g.w * 0.25] : [x1 - g.w * 0.25, x0 + g.w * 0.25]
  const as = node.hinge === 'r' ? -1 : 1
  const slideArrow = `M${r2(ax0)} ${r2(ym)}H${r2(ax1)}M${r2(ax1 + as * ad)} ${r2(ym - ad * 0.8)}L${r2(ax1)} ${r2(ym)}L${r2(ax1 + as * ad)} ${r2(ym + ad * 0.8)}`
  const paths: string[] =
    node.o === 'turn' || node.o === 'door'
      ? [turn]
      : node.o === 'tiltturn'
        ? [turn, tilt]
        : node.o === 'tilt'
          ? [tilt]
          : node.o === 'awning'
            ? [awning]
            : node.o === 'psk'
              ? [tilt, slideArrow]
              : node.o === 'ps'
                ? [slideArrow]
                : []
  if (node.o === 'pivotv' || node.o === 'pivoth') {
    const axis = node.o === 'pivotv' ? `M${r2(xm)} ${r2(y0)}V${r2(y1)}` : `M${r2(x0)} ${r2(ym)}H${r2(x1)}`
    out.push(<path key={`${key}-ax`} d={axis} strokeWidth={thin} strokeOpacity={0.8} strokeDasharray="3 1.4 0.8 1.4" />)
  }
  if (node.o === 'louver') {
    const lines = Array.from({ length: 5 }, (_, i) => `M${r2(x0)} ${r2(y0 + (g.h * (i + 1)) / 6)}H${r2(x1)}`).join('')
    out.push(<path key={`${key}-lv`} d={lines} strokeWidth={thin} strokeOpacity={0.8} />)
  }
  if (node.o === 'blind') {
    const inner2 = { x: g.x + 3, y: g.y + 3, w: g.w - 6, h: g.h - 6 }
    out.push(rect(inner2, { strokeWidth: thin * 0.8, strokeOpacity: 0.55, fill: 'currentColor', fillOpacity: 0.12 }, `${key}-bl`))
    const hx = node.hinge === 'r' ? x0 + 2.2 : x1 - 2.2
    out.push(<path key={`${key}-bh`} d={`M${r2(hx)} ${r2(y0 + g.h * 0.5)}v${r2(g.h * 0.06)}`} strokeWidth={sw * 1.2} strokeLinecap="round" />)
  }
  if (node.zocalo) {
    const zy = y0 + g.h * 0.62
    out.push(<path key={`${key}-zb`} d={`M${r2(x0)} ${r2(zy)}H${r2(x1)}`} strokeWidth={thin} />)
    out.push(rect({ x: x0, y: zy, w: g.w, h: y1 - zy }, { fill: 'currentColor', fillOpacity: 0.16, stroke: 'none' }, `${key}-zp`))
  }
  paths.forEach((d, i) =>
    out.push(<path key={`${key}-o${i}`} d={d} strokeWidth={thin} strokeOpacity={0.8} strokeDasharray={node.out ? '2.4 1.8' : undefined} />),
  )
  if (node.o === 'door') {
    const hx = node.hinge === 'r' ? x0 + 2.2 : x1 - 2.2
    out.push(<path key={`${key}-h`} d={`M${r2(hx)} ${r2(y0 + g.h * 0.5)}v${r2(g.h * 0.06)}`} strokeWidth={sw * 1.2} strokeLinecap="round" />)
  }
}

export interface TypologyIconProps {
  typologyId: TypologyId
  /** Lado del cuadrado en px (48 por defecto). */
  size?: number
  className?: string
  title?: string
  strokeWidth?: number
}

/** Pictograma de una tipología (ventana o puerta) en un cuadrado de `size` px. */
export function TypologyIcon({ typologyId, size = 48, className, title, strokeWidth = 1.5 }: TypologyIconProps) {
  const spec = TYPOLOGY_ICON_SPECS[typologyId] ?? TYPOLOGY_ICON_SPECS.fixed
  const S = 48
  const M = 5
  const avail = S - 2 * M
  const w = spec.aspect >= 1 ? avail : avail * spec.aspect
  const h = spec.aspect >= 1 ? avail / spec.aspect : avail
  const outer: Box = { x: (S - w) / 2, y: (S - h) / 2, w, h }
  const f = 3.2
  const inner: Box = { x: outer.x + f, y: outer.y + f, w: outer.w - 2 * f, h: outer.h - 2 * f }
  const parts: ReactNode[] = []
  const label = title ?? TYPOLOGY_ICON_LABELS[typologyId] ?? typologyId

  if (spec.shape) {
    const { x, y } = outer
    let outerD: string
    let innerD: string
    let lowerBox: Box | undefined
    if (spec.shape === 'arch') {
      const rise = Math.min(h * 0.85, w * (spec.rise ?? 0.5))
      // Arco rebajado = arco de circunferencia (radio mayor que la semiluz); medio punto = semicírculo.
      const radius = (w * w) / (8 * rise) + rise / 2
      const innerRadius = Math.max(1, radius - f)
      outerD = `M${r2(x)} ${r2(y + h)}V${r2(y + rise)}A${r2(radius)} ${r2(radius)} 0 0 1 ${r2(x + w)} ${r2(y + rise)}V${r2(y + h)}Z`
      innerD = `M${r2(x + f)} ${r2(y + h - f)}V${r2(y + rise)}A${r2(innerRadius)} ${r2(innerRadius)} 0 0 1 ${r2(x + w - f)} ${r2(y + rise)}V${r2(y + h - f)}Z`
      if (spec.lower) lowerBox = { x: x + f, y: y + rise, w: w - 2 * f, h: h - rise - f }
    } else if (spec.shape === 'round' || spec.shape === 'oval') {
      const rx = spec.shape === 'round' ? Math.min(w, h) / 2 : w / 2
      const ry = spec.shape === 'round' ? Math.min(w, h) / 2 : h / 2
      const cx = x + w / 2
      const cy = y + h / 2
      const ellipse = (a: number, b: number) => `M${r2(cx + a)} ${r2(cy)}A${r2(a)} ${r2(b)} 0 1 1 ${r2(cx - a)} ${r2(cy)}A${r2(a)} ${r2(b)} 0 1 1 ${r2(cx + a)} ${r2(cy)}Z`
      outerD = ellipse(rx, ry)
      innerD = ellipse(rx - f, ry - f)
    } else if (spec.shape === 'pentagon' || spec.shape === 'octagon' || spec.shape === 'gable') {
      const poly = (bx: number, by: number, bw: number, bh: number): [number, number][] => {
        if (spec.shape === 'pentagon') return [[bx + bw * 0.19, by + bh], [bx + bw * 0.81, by + bh], [bx + bw, by + bh * 0.38], [bx + bw / 2, by], [bx, by + bh * 0.38]]
        if (spec.shape === 'gable') return [[bx, by + bh], [bx + bw, by + bh], [bx + bw, by + bh * 0.4], [bx + bw / 2, by], [bx, by + bh * 0.4]]
        const c = Math.min(bw, bh) * 0.29
        return [[bx + c, by + bh], [bx + bw - c, by + bh], [bx + bw, by + bh - c], [bx + bw, by + c], [bx + bw - c, by], [bx + c, by], [bx, by + c], [bx, by + bh - c]]
      }
      const d = (pts: [number, number][]) => 'M' + pts.map(([px, py]) => `${r2(px)} ${r2(py)}`).join('L') + 'Z'
      outerD = d(poly(x, y, w, h))
      innerD = d(poly(x + f, y + f * (spec.shape === 'octagon' ? 1 : 1.6), w - 2 * f, h - f * (spec.shape === 'octagon' ? 2 : 2.6)))
    } else if (spec.shape === 'trapezoid') {
      outerD = `M${r2(x)} ${r2(y + h * 0.45)}L${r2(x + w)} ${r2(y)}V${r2(y + h)}H${r2(x)}Z`
      innerD = `M${r2(x + f)} ${r2(y + h * 0.45 + f * 0.7)}L${r2(x + w - f)} ${r2(y + f * 1.9)}V${r2(y + h - f)}H${r2(x + f)}Z`
    } else {
      outerD = `M${r2(x + w / 2)} ${r2(y)}L${r2(x + w)} ${r2(y + h)}H${r2(x)}Z`
      innerD = `M${r2(x + w / 2)} ${r2(y + f * 2.4)}L${r2(x + w - f * 2.3)} ${r2(y + h - f)}H${r2(x + f * 2.3)}Z`
    }
    parts.push(<path key="g" d={innerD} fill="currentColor" fillOpacity={0.07} stroke="none" />)
    parts.push(<path key="o" d={outerD} strokeWidth={strokeWidth} strokeLinejoin="round" />)
    parts.push(<path key="i" d={innerD} strokeWidth={strokeWidth * 0.7} strokeLinejoin="round" />)
    if (spec.lower && lowerBox) {
      // Imposta bajo el arco y la hoja que abre debajo.
      parts.push(<path key="imp" d={`M${r2(lowerBox.x)} ${r2(lowerBox.y)}H${r2(lowerBox.x + lowerBox.w)}`} strokeWidth={strokeWidth * 0.9} />)
      renderNode(spec.lower, lowerBox, parts, 'lw', strokeWidth)
    }
  } else {
    parts.push(rect(outer, { rx: 1.2, strokeWidth }, 'o'))
    parts.push(rect(inner, { strokeWidth: strokeWidth * 0.7 }, 'i'))
    renderNode(spec.root, inner, parts, 'n', strokeWidth)
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${S} ${S}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={label}
      data-typology={typologyId}
    >
      <title>{label}</title>
      {parts}
    </svg>
  )
}
