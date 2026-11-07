import type {
  AccessoryRule,
  Bom,
  Catalog,
  ColorVariants,
  CutPiece,
  ExtraKind,
  Glass,
  GlassPiece,
  HardwareUnit,
  Id,
  Item,
  ItemLine,
  PanelPiece,
  Profile,
  ProfileRole,
  ShapeKind,
  Side,
  Warning,
  WindowDesign,
} from '../types'
import { paneParams, type Dimension, type OpeningLimitParams } from '../warnings'
import { assemblyBom, isAssembly } from './assembly'
import { createContext, profileForRole, requireProfile, ROLE_NAMES, type EngineContext } from './context'
import { BENDING_GRIP_MM, DEFAULT_WEIGHTS, ELEMENT_MAX_WIDTH, GLASS_LIMITS, MAX_SLIDING_PANELS, OPENING_SIZE_LIMITS, REINFORCEMENT_WELD_MM, type OpeningLimitClass } from './defaults'
import { formatNumber, fmtM2, fmtMm, mm1, round } from './format'
import { evaluateHardware, gapCoverage, gapText, HARDWARE_KIND_NAMES, type HardwareRange, type HardwareTargetKind } from './hardware'
import { openingDirection } from './pauta'
import { chordAlong, clipRing, splitCurvedEdges } from './shapes'
import { cellSpecs, shrink, slidingSpec, type CellLabel, type CellSpec, type FixedSpec, type SashSpec } from './specs'

/**
 * Despiece de una ventana: cortes de perfiles (marco y hojas a 45°, travesaños, guías y
 * traslapos a 90°), junquillos, refuerzos por pieza, vidrios, herrajes por regla y
 * accesorios. Nunca lanza: lo que falta se informa como aviso y el resto se calcula igual.
 */
export function computeBom(design: WindowDesign, catalog: Catalog): Bom {
  if (isAssembly(design)) return assemblyBom(design, catalog, computeBom)
  const ctx = createContext(design, catalog)
  const b = new BomBuilder(ctx)
  const { W, H } = ctx
  if (W > 0 && H > 0) {
    addFrame(ctx, b)
    if (ctx.tree.sliding) addSliding(ctx, b)
    else addTree(ctx, b)
    addFrameAddons(ctx, b)
    addHardware(ctx, b)
    addAccessories(ctx, b)
    checkLimits(ctx, b)
    checkPrices(ctx, b)
  }
  const cuts = [...b.profiles, ...b.beads, ...b.steel]
  const perimeterMm = ctx.shape ? ctx.shape.perimeter : 2 * (W + H)
  return {
    cuts,
    glass: b.glass,
    // Solo cuando hay paneles ciegos: el despiece de una ventana con vidrio no cambia.
    ...(b.panels.length ? { panels: b.panels } : {}),
    items: [...b.items.values()],
    warnings: ctx.warnings.list,
    area: round((W * H) / 1e6, 4),
    perimeter: round(perimeterMm / 1000, 3),
    weightKg: round(estimateWeight(ctx, cuts, b.glass), 1),
  }
}

// ─── Constructor del despiece ────────────────────────────────────────────────

interface CutSpec {
  kind: CutPiece['kind']
  role: ProfileRole
  profile?: Profile
  length: number
  qty: number
  angles: [number, number]
  side: Side
  label: string
  nodeId: Id
}

class BomBuilder {
  readonly profiles: CutPiece[] = []
  readonly beads: CutPiece[] = []
  readonly steel: CutPiece[] = []
  readonly glass: GlassPiece[] = []
  /** Paneles ciegos (relleno opaco en vez de vidrio), para cotizarlos con reglas `scope: 'panels'`. */
  readonly panels: PanelPiece[] = []
  readonly items = new Map<string, ItemLine>()
  /** Hojas y paneles (para accesorios «por hoja»). */
  sashCount = 0
  readonly hardwareTargets: {
    nodeId: Id
    label: CellLabel
    kind: HardwareTargetKind
    w: number
    h: number
    /** Hoja pasiva (francesa o plegable). */
    passive?: boolean
    sequence?: 'turn_first' | 'tilt_first'
    /** Rango indicativo de tamaño que le corresponde (sin dato = sin control). */
    limit?: OpeningLimitClass
  }[] = []

  constructor(private readonly ctx: EngineContext) {}

  cut(spec: CutSpec): void {
    const length = mm1(spec.length)
    if (!(length > 0) || !(spec.qty > 0)) return
    const list = spec.kind === 'bead' ? this.beads : spec.kind === 'reinforcement' ? this.steel : this.profiles
    const p = spec.profile
    const piece: CutPiece = {
      kind: spec.kind,
      code: p?.code ?? '—',
      name: p?.name ?? capitalize(ROLE_NAMES[spec.role]),
      role: spec.role,
      length,
      qty: spec.qty,
      angleStart: spec.angles[0],
      angleEnd: spec.angles[1],
      side: spec.side,
      label: spec.label,
      nodeId: spec.nodeId,
      // Sin largo propio no se asume uno: lo decide la sierra del taller (`cut.barLength`, ver `planCuts`).
      barLength: p?.barLength && p.barLength > 0 ? p.barLength : 0,
    }
    if (p?.id && !(p.barLength > 0)) {
      this.ctx.warnings.add(
        { level: 'info', code: 'bar_length_missing', message: `${p.code} no trae largo de barra en el catálogo: se optimiza con el largo de Ajustes › Taller.`, params: { profile: p.code } },
        `bar_length_missing|${p.code}`,
      )
    }
    if (p) piece.profileId = p.id
    if (spec.kind !== 'reinforcement' && this.ctx.design.colorId) piece.colorId = this.ctx.design.colorId
    const same = list.find(
      (c) =>
        c.nodeId === piece.nodeId &&
        c.code === piece.code &&
        c.role === piece.role &&
        c.length === piece.length &&
        c.angleStart === piece.angleStart &&
        c.angleEnd === piece.angleEnd &&
        c.label === piece.label,
    )
    if (same) same.qty += piece.qty
    else list.push(piece)
  }

  /**
   * Refuerzo de acero de una pieza: corte − descuento de la pauta, a 90°. Si la pieza tiene
   * acero asignado pero la pauta no trae descuento, se usa 2·soldadura + 30 con aviso.
   */
  reinforce(parent: Profile | undefined, deduction: number | undefined, weld: number, corte: number, qty: number, side: Side, label: string, nodeId: Id): void {
    const steelId = parent?.reinforcementId
    if (deduction === undefined && !steelId) return
    const steel = steelId ? this.ctx.profiles.get(steelId) : undefined
    const stated = deduction
    const parentName = parent?.code ?? 'la pieza'
    let ded = deduction
    if (ded === undefined) {
      ded = 2 * weld + 30
      this.ctx.warnings.add(
        {
          level: 'info',
          code: 'reinforcement_deduction_missing',
          message: `${parentName} lleva refuerzo, pero la pauta no indica cuánto descontarle: usamos corte − ${fmtMm(ded)}.`,
          params: { deduction: ded, ...(parent ? { profile: parent.code } : {}) },
        },
        `reinforcement_deduction_missing|${parentName}`,
      )
    }
    if (!steel) {
      this.ctx.warnings.add(
        {
          level: 'info',
          code: 'reinforcement_profile_missing',
          message: `${parentName} lleva refuerzo, pero no tiene un acero asignado en el catálogo: se lista como «REF» sin precio.`,
          params: parent ? { profile: parent.code } : {},
        },
        `reinforcement_profile_missing|${parentName}`,
      )
    }
    // El acero depende de la cota, no de la soldadura: los descuentos de pauta están medidos desde un
    // corte con REINFORCEMENT_WELD_MM por extremo (`W − 108` con cualquier soldadura).
    const length = mm1(stated !== undefined && weld > 0 ? corte - 2 * weld - (ded - 2 * REINFORCEMENT_WELD_MM) : corte - ded)
    if (!(length > 0)) return
    const add = (profile: Profile) => this.cut({ kind: 'reinforcement', role: 'reinforcement', profile, length, qty, angles: [90, 90], side, label, nodeId })
    add(steel ?? { ...placeholderSteel, name: `Refuerzo de ${parentName}` })
    // Segundo refuerzo de la misma pieza, cuando la línea lo declara.
    for (const id of parent?.extraReinforcementIds ?? []) {
      const extra = this.ctx.profiles.get(id)
      if (extra) add(extra)
    }
  }

  addGlass(glassId: Id, w: number, h: number, nodeId: Id, label: CellLabel, shape?: ShapeKind, real?: { area: number; outline?: string }): void {
    const ctx = this.ctx
    if (!(w > 0) || !(h > 0)) return
    const glass = ctx.glasses.get(glassId)
    if (!glass) {
      ctx.warnings.add(
        {
          level: 'warn',
          code: 'glass_missing',
          message: 'El vidrio elegido no está en el catálogo: se lista sin precio. Elige un vidrio para cotizarlo.',
          fix: ctx.catalog.glass[0]
            ? { label: `Usar ${ctx.catalog.glass[0].name}`, key: 'use', params: { name: ctx.catalog.glass[0].name }, patch: { glassId: ctx.catalog.glass[0].id } }
            : undefined,
        },
        `glass_missing|${glassId}`,
      )
    }
    // Área de cobro: el rectángulo envolvente (así factura el proveedor de vidrio, también en formas).
    const area = round((w * h) / 1e6, 4)
    const piece: GlassPiece = {
      glassId,
      name: glass?.name ?? 'Vidrio sin definir',
      width: mm1(w),
      height: mm1(h),
      qty: 1,
      area,
      nodeId,
      label: label.short,
    }
    if (shape) piece.shape = shape
    // Vidrio con forma: su área real (peso y avisos de manipulación) y su contorno para el corte.
    if (real && real.area > 0) piece.realArea = round(real.area / 1e6, 4)
    if (real?.outline) piece.outline = real.outline
    this.glass.push(piece)
    checkGlassSize(ctx, glass, piece, label)
  }

  /** Panel ciego: el relleno de un paño con `fill: 'panel'` (misma medida que llevaría el vidrio). */
  addPanel(w: number, h: number, nodeId: Id, label: CellLabel, kind?: PanelPiece['kind']): void {
    if (!(w > 0) || !(h > 0)) return
    this.panels.push({ nodeId, label: label.short, width: mm1(w), height: mm1(h), qty: 1, area: round((w * h) / 1e6, 4), ...(kind ? { kind } : {}) })
  }

  addItem(itemId: Id, qty: number, kindFallback: Item['kind'], nodeId?: Id): void {
    if (!(qty > 0)) return
    const item = this.ctx.items.get(itemId)
    if (!item) {
      this.ctx.warnings.add(
        {
          level: 'warn',
          code: 'item_missing',
          message: `${kindFallback === 'hardware' ? 'Un herraje' : 'Un accesorio'} de ${this.ctx.lineName} (código ${itemId}) no está en el catálogo: queda fuera del total.`,
          params: { kind: kindFallback === 'hardware' ? 'hardware' : 'accessory', line: this.ctx.lineName, code: itemId },
        },
        `item_missing|${itemId}`,
      )
    }
    const key = `${itemId}|${nodeId ?? ''}`
    const prev = this.items.get(key)
    if (prev) {
      prev.qty = round(prev.qty + qty, 2)
      return
    }
    const line: ItemLine = {
      itemId,
      code: item?.code ?? itemId,
      name: item?.name ?? (kindFallback === 'hardware' ? 'Herraje sin ficha' : 'Accesorio sin ficha'),
      unit: consumptionUnit(item),
      qty: round(qty, 2),
      kind: item?.kind ?? kindFallback,
    }
    if (nodeId) line.nodeId = nodeId
    this.items.set(key, line)
  }
}

/**
 * Unidad en que se cuenta un ítem en el despiece: los envases (caja de 1.000 tornillos, rollo
 * de 100 m) se cuentan sueltos, igual que el precio. La caja solo aparece al comprar.
 */
function consumptionUnit(item: Item | undefined): HardwareUnit {
  if (!item) return 'u'
  if ((item.packSize ?? 0) > 1) return item.unit === 'm' || item.unit === 'm2' ? item.unit : 'u'
  return item.unit ?? 'u'
}

/**
 * Ítem de una regla según el color de la ventana (bisagra marrón, tapa de desagüe negra…).
 * Manda el color del lado que diga la regla (por defecto `side`); un color sin variante, o una
 * variante que ya no está en el catálogo, usa el ítem base.
 */
function variantItemId(ctx: EngineContext, rule: ColorVariants & { itemId: Id }, side: 'exterior' | 'interior'): Id {
  const map = rule.byColor
  if (!map) return rule.itemId
  const { colorId, colorInId } = ctx.design
  const color = (rule.colorSide ?? side) === 'interior' ? colorInId || colorId : colorId
  const id = color ? map[color] : undefined
  return id && ctx.items.has(id) ? id : rule.itemId
}

const placeholderSteel: Profile = {
  id: '',
  lineId: '',
  code: 'REF',
  name: 'Refuerzo de acero',
  role: 'reinforcement',
  barLength: 0,
  priceByColor: {},
}

const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** «de la hoja», «del paño fijo». */
const ofLabel = (long: string): string => (long.startsWith('el ') ? 'del ' + long.slice(3) : 'de ' + long)

// ─── Marco ──────────────────────────────────────────────────────────────────

function addFrame(ctx: EngineContext, b: BomBuilder): void {
  const role: ProfileRole = ctx.isSliding ? 'sliding_frame' : 'frame'
  const profile = requireProfile(ctx, role)
  const { W, H, base } = ctx
  const w = base.weld
  const ded = base.reinforcement?.frame

  if (ctx.shape) {
    for (const e of ctx.shape.outer.edges) {
      const corte = e.length + 2 * w
      b.cut({ kind: 'profile', role, profile, length: corte, qty: 1, angles: [e.angleStart, e.angleEnd], side: e.side, label: e.label, nodeId: 'frame' })
      // El acero no se curva: los tramos en arco van sin refuerzo.
      if (!e.curved) b.reinforce(profile, ded, w, mm1(corte), 1, e.side, e.label, 'frame')
    }
    return
  }

  if (ctx.threshold) {
    // Puerta con umbral: dintel 45/45, jambas 45° arriba y 90° al piso, umbral entre jambas.
    b.cut({ kind: 'profile', role, profile, length: W + 2 * w, qty: 1, angles: [45, 45], side: 'top', label: 'arr', nodeId: 'frame' })
    b.reinforce(profile, ded, w, mm1(W + 2 * w), 1, 'top', 'arr', 'frame')
    b.cut({ kind: 'profile', role, profile, length: H + w, qty: 2, angles: [45, 90], side: 'left', label: 'izq/der', nodeId: 'frame' })
    // La jamba solo tiene inglete arriba: descuenta un extremo (plantilla PRO6004 900×2000: H − 54).
    b.reinforce(profile, ded === undefined ? undefined : (ded - 2 * REINFORCEMENT_WELD_MM) / 2, 0, mm1(H), 2, 'left', 'izq/der', 'frame')
    b.cut({
      kind: 'profile',
      role: 'threshold',
      profile: ctx.threshold,
      // Entre jambas, a la luz del marco (plantilla: W − 88).
      length: W - 2 * ctx.base.frameDeduction,
      qty: 1,
      angles: [90, 90],
      side: 'bottom',
      label: 'umbral',
      nodeId: 'frame',
    })
    return
  }

  b.cut({ kind: 'profile', role, profile, length: W + 2 * w, qty: 2, angles: [45, 45], side: 'top', label: 'arr/aba', nodeId: 'frame' })
  b.reinforce(profile, ded, w, mm1(W + 2 * w), 2, 'top', 'arr/aba', 'frame')
  b.cut({ kind: 'profile', role, profile, length: H + 2 * w, qty: 2, angles: [45, 45], side: 'left', label: 'izq/der', nodeId: 'frame' })
  b.reinforce(profile, ded, w, mm1(H + 2 * w), 2, 'left', 'izq/der', 'frame')
}

// ─── Practicables (árbol de paños) ──────────────────────────────────────────

function addTree(ctx: EngineContext, b: BomBuilder): void {
  const { base } = ctx
  const mullionProfile = ctx.tree.dividers.some((d) => d.kind === 'mullion') ? requireProfile(ctx, 'mullion') : undefined
  const outerRing = ctx.shape ? ctx.shape.ring(0) : undefined
  for (const d of ctx.tree.dividers) {
    if (d.kind !== 'mullion') continue
    const vertical = d.dir === 'vertical'
    const side: Side = vertical ? 'mullion' : 'transom'
    // El travesaño cruza su región completa: borde exterior del marco o eje del travesaño vecino.
    let from = vertical ? d.box.y0 : d.box.x0
    let to = vertical ? d.box.y1 : d.box.x1
    let angles: [number, number] = [90, 90]
    if (outerRing) {
      // En una forma, hasta el contorno exterior a lo largo de su eje (corte según la tangente).
      const chord = chordAlong(outerRing, d.dir, d.axis)
      if (!chord) continue
      if (chord.from > from) {
        from = chord.from
        angles = [chord.angleFrom, angles[1]]
      }
      if (chord.to < to) {
        to = chord.to
        angles = [angles[0], chord.angleTo]
      }
    }
    const length = to - from
    if (!(length > 0)) continue
    b.cut({ kind: 'profile', role: 'mullion', profile: mullionProfile, length, qty: 1, angles, side, label: 'trav', nodeId: d.node.id })
    b.reinforce(mullionProfile, base.reinforcement?.mullion, 0, mm1(length), 1, side, 'trav', d.node.id)
  }

  const specs = cellSpecs(ctx)
  addFoldGuides(ctx, b, specs)
  const singleShape = !!ctx.shape && specs.length === 1 && specs[0].type === 'fixed'
  for (const [index, spec] of specs.entries()) {
    if (!paneFits(ctx, spec)) continue
    if (spec.type === 'fixed') {
      b.hardwareTargets.push({ nodeId: spec.nodeId, label: spec.label, kind: 'fixed', w: spec.luz.w, h: spec.luz.h })
      if (singleShape && ctx.shape) {
        addShapePane(ctx, b, spec)
        continue
      }
      if (ctx.shape && ctx.shapeFit[index] === 'clip') {
        addClippedPane(ctx, b, spec)
        continue
      }
      addBeads(b, ctx, spec.bead.w, spec.bead.h, spec.nodeId, spec.fill === 'glass' ? spec.glassId : undefined)
      if (spec.fill === 'glass') b.addGlass(spec.glassId, spec.glass.w, spec.glass.h, spec.nodeId, spec.label)
      else b.addPanel(spec.glass.w, spec.glass.h, spec.nodeId, spec.label, spec.fill === 'louver' ? 'louver' : undefined)
      checkSmall(ctx, spec.glass.w, spec.glass.h, spec.label, spec.nodeId)
      continue
    }
    addSash(ctx, b, spec)
  }
}

function paneFits(ctx: EngineContext, spec: CellSpec): boolean {
  const g = spec.glass
  if (spec.luz.w <= 0 || spec.luz.h <= 0 || g.w <= 0 || g.h <= 0) {
    ctx.warnings.add({
      level: 'error',
      code: 'pane_impossible',
      nodeId: spec.nodeId,
      message: `${capitalize(spec.label.long)} no cabe: su medida es menor que los descuentos de la pauta. Agranda el paño o quita una división.`,
      params: { ...paneParams(spec.label.ref), variant: 'fit' },
    })
    return false
  }
  return true
}

/**
 * Largo máximo de un tramo curvo de junquillo: su barra menos el agarre de la curvadora. Un tramo más
 * largo se parte en piezas iguales unidas a 90°, igual que el marco (que además descuenta la soldadura).
 * Sin largo de barra en el catálogo no se parte según un largo supuesto: el perfil ya avisó
 * (`bar_length_missing`) y el optimizador señala la pieza si no cabe en la barra de Ajustes.
 */
function beadMaxArc(bead: Profile | undefined): number | undefined {
  return bead?.barLength && bead.barLength > 0 ? bead.barLength - BENDING_GRIP_MM : undefined
}

/**
 * Junquillo según el espesor del vidrio: si la línea publica rangos (`provenance.beads`) se usa el
 * que calza y, si ninguno calza, se avisa y queda el de la línea. Sin rangos, el de la línea.
 */
function beadFor(ctx: EngineContext, glassId: Id | undefined): Profile | undefined {
  const fallback = requireProfile(ctx, 'bead')
  const ranges = ctx.line?.provenance?.beads
  const thickness = glassId ? ctx.glasses.get(glassId)?.thickness : undefined
  if (!ranges?.length || !thickness) return fallback
  const fits = ranges.filter((r) => thickness >= r.min && thickness <= r.max)
  const hit = fits.map((r) => ctx.catalog.profiles.find((p) => p.lineId === ctx.line?.id && p.code === r.code)).find(Boolean)
  if (hit) return hit
  if (fits.length === 0) {
    ctx.warnings.add(
      { level: 'warn', code: 'bead_no_fit', message: `Ningún junquillo de ${ctx.lineName} calza con un vidrio de ${fmtMm(thickness)}: revisa el vidrio o la línea.`, params: { line: ctx.lineName, thickness } },
      `bead_no_fit|${thickness}`,
    )
  }
  return fallback
}

function addBeads(b: BomBuilder, ctx: EngineContext, w: number, h: number, nodeId: Id, glassId?: Id): void {
  const bead = beadFor(ctx, glassId)
  b.cut({ kind: 'bead', role: 'bead', profile: bead, length: w, qty: 2, angles: [45, 45], side: 'top', label: 'arr/aba', nodeId })
  b.cut({ kind: 'bead', role: 'bead', profile: bead, length: h, qty: 2, angles: [45, 45], side: 'left', label: 'izq/der', nodeId })
}

function addShapePane(ctx: EngineContext, b: BomBuilder, spec: CellSpec): void {
  const shape = ctx.shape
  if (!shape) return
  const bead = requireProfile(ctx, 'bead')
  const fd = ctx.base.frameDeduction
  // Junquillo y vidrio siguen el contorno real (no el rectángulo envolvente). Los tramos curvos del
  // junquillo se parten según SU barra (no la del marco): piezas iguales unidas a 90°.
  for (const e of shape.inset(fd, { maxArc: beadMaxArc(bead) }).edges) {
    b.cut({ kind: 'bead', role: 'bead', profile: bead, length: e.length, qty: 1, angles: [e.angleStart, e.angleEnd], side: e.side, label: e.label, nodeId: spec.nodeId })
  }
  const inset = shape.inset(fd + ctx.base.glassGap)
  const g = inset.bbox
  if (spec.fill !== 'glass') {
    b.addPanel(g.w, g.h, spec.nodeId, spec.label)
    return
  }
  b.addGlass(spec.glassId, g.w, g.h, spec.nodeId, spec.label, shape.kind, { area: inset.area, outline: inset.path })
  checkSmall(ctx, g.w, g.h, spec.label, spec.nodeId)
}

/**
 * Paño fijo de una forma con travesaños: junquillo y vidrio siguen la intersección del contorno
 * con el paño (la cuerda del travesaño y el tramo de arco o inclinado que le toca).
 */
function addClippedPane(ctx: EngineContext, b: BomBuilder, spec: FixedSpec): void {
  const shape = ctx.shape
  if (!shape) return
  const fd = ctx.base.frameDeduction
  const gap = ctx.base.glassGap
  const beadRegion = clipRing(shape.ring(fd), spec.luz)
  if (!beadRegion) {
    ctx.warnings.add({
      level: 'error',
      code: 'pane_impossible',
      nodeId: spec.nodeId,
      message: `${capitalize(spec.label.long)} queda fuera de la forma: mueve el travesaño o quita la división.`,
      params: { ...paneParams(spec.label.ref), variant: 'outside' },
    })
    return
  }
  const bead = requireProfile(ctx, 'bead')
  for (const e of splitCurvedEdges(beadRegion.edges, beadMaxArc(bead) ?? Infinity)) {
    b.cut({ kind: 'bead', role: 'bead', profile: bead, length: e.length, qty: 1, angles: [e.angleStart, e.angleEnd], side: e.side, label: e.label, nodeId: spec.nodeId })
  }
  const glass = clipRing(shape.ring(fd + gap), shrink(spec.luz, gap))
  if (!glass) return
  if (spec.fill !== 'glass') {
    b.addPanel(glass.bbox.w, glass.bbox.h, spec.nodeId, spec.label)
    return
  }
  b.addGlass(spec.glassId, glass.bbox.w, glass.bbox.h, spec.nodeId, spec.label, glass.touchesShape ? shape.kind : undefined, glass.touchesShape ? { area: glass.area, outline: glass.path } : undefined)
  checkSmall(ctx, glass.bbox.w, glass.bbox.h, spec.label, spec.nodeId)
}

/**
 * Plegables: riel superior e inferior a lo ancho de la luz de cada cadena (perfil de guía de la
 * línea). Las hojas no llevan travesaño entre ellas.
 */
function addFoldGuides(ctx: EngineContext, b: BomBuilder, specs: CellSpec[]): void {
  const chains = new Map<Id, { x0: number; x1: number }>()
  for (const spec of specs) {
    if (spec.cell.pair !== 'fold') continue
    const splitId = spec.cell.path[spec.cell.path.length - 2]
    if (!splitId) continue
    const c = chains.get(splitId) ?? { x0: Infinity, x1: -Infinity }
    c.x0 = Math.min(c.x0, spec.luz.x)
    c.x1 = Math.max(c.x1, spec.luz.x + spec.luz.w)
    chains.set(splitId, c)
  }
  if (chains.size === 0) return
  const guide = requireProfile(ctx, 'guide')
  for (const [splitId, c] of chains) {
    b.cut({ kind: 'profile', role: 'guide', profile: guide, length: c.x1 - c.x0, qty: 2, angles: [90, 90], side: 'guide', label: 'guía', nodeId: splitId })
  }
}

function addSash(ctx: EngineContext, b: BomBuilder, spec: SashSpec): void {
  const { pauta, profile, role, cut, nodeId } = spec
  b.sashCount++
  b.cut({ kind: 'profile', role, profile, length: cut.w, qty: 2, angles: [45, 45], side: 'top', label: 'arr/aba', nodeId })
  b.reinforce(profile, pauta.reinforcement?.sash, pauta.weld, cut.w, 2, 'top', 'arr/aba', nodeId)
  b.cut({ kind: 'profile', role, profile, length: cut.h, qty: 2, angles: [45, 45], side: 'left', label: 'izq/der', nodeId })
  b.reinforce(profile, pauta.reinforcement?.sash, pauta.weld, cut.h, 2, 'left', 'izq/der', nodeId)
  if (spec.passive && spec.cell.pair !== 'fold') {
    // Inversor en la hoja pasiva: largo = alto nominal de la hoja, a 90° (supuesto sin dato OT).
    const inv = requireProfile(ctx, 'french_mullion')
    const invLength = spec.nominal.h - (spec.pauta.frenchMullionDeduction ?? 0)
    b.cut({ kind: 'profile', role: 'french_mullion', profile: inv, length: invLength, qty: 1, angles: [90, 90], side: 'other', label: 'inversor', nodeId })
    if (inv?.reinforcementId) b.reinforce(inv, ctx.base.reinforcement?.mullion, 0, invLength, 1, 'other', 'inversor', nodeId)
  }
  addBeads(b, ctx, spec.bead.w, spec.bead.h, nodeId, spec.fill === 'glass' ? spec.glassId : undefined)
  if (spec.fill === 'glass') b.addGlass(spec.glassId, spec.glass.w, spec.glass.h, nodeId, spec.label)
  else b.addPanel(spec.glass.w, spec.glass.h, nodeId, spec.label, spec.fill === 'louver' ? 'louver' : undefined)
  // Puerta sobre solera: perfil de estanqueidad al ancho de la hoja, si la línea lo trae.
  if (spec.cell.edges.bottom === 'threshold' && spec.variant.startsWith('door')) {
    const seal = sealProfile(ctx)
    if (seal) b.cut({ kind: 'profile', role: 'other', profile: seal, length: spec.nominal.w, qty: 1, angles: [90, 90], side: 'bottom', label: 'estanqueidad', nodeId })
  }
  if (spec.zocalo) {
    // Zócalo: travesaño de hoja, junquillo de la banda inferior y su panel. Mismos herrajes.
    const z = spec.zocalo
    const bar = requireProfile(ctx, 'mullion')
    b.cut({ kind: 'profile', role: 'mullion', profile: bar, length: z.barLength, qty: 1, angles: [90, 90], side: 'transom', label: 'trav. zócalo', nodeId })
    b.reinforce(bar, ctx.base.reinforcement?.mullion, 0, mm1(z.barLength), 1, 'transom', 'trav. zócalo', nodeId)
    addBeads(b, ctx, z.panelBead.w, z.panelBead.h, nodeId)
    b.addPanel(z.panel.w, z.panel.h, nodeId, { ...spec.label, short: `${spec.label.short} · zócalo` }, 'zocalo')
  }
  b.hardwareTargets.push({
    nodeId,
    label: spec.label,
    kind: spec.opening.kind,
    w: spec.nominal.w,
    h: spec.nominal.h,
    passive: spec.passive,
    sequence: spec.opening.sequence,
    limit: limitClass(spec),
  })
  checkSmall(ctx, spec.glass.w, spec.glass.h, spec.label, nodeId)
}

/** Rango indicativo de tamaño de una hoja (ver OPENING_SIZE_LIMITS). */
function limitClass(spec: SashSpec): OpeningLimitClass | undefined {
  const { opening } = spec
  const door = spec.variant === 'door' || spec.variant === 'door_out'
  switch (opening.kind) {
    case 'casement':
      return door ? 'door' : openingDirection(opening) === 'out' ? 'casement_out' : 'casement'
    case 'tilt_turn':
      return door ? 'tilt_turn_door' : 'tilt_turn'
    case 'door':
      return 'door'
    case 'folding':
      return spec.cell.foldAccess ? 'folding_access' : 'folding'
    case 'awning':
    case 'tilt':
    case 'pivot_h':
    case 'pivot_v':
    case 'tilt_slide':
    case 'parallel_slide':
      return opening.kind
    default:
      return undefined
  }
}

// ─── Corredera ──────────────────────────────────────────────────────────────

function addSliding(ctx: EngineContext, b: BomBuilder): void {
  const spec = slidingSpec(ctx)
  const node = ctx.tree.sliding
  if (!spec || !node) return
  const base = spec.pauta ?? ctx.base
  if (spec.panels.length < 2) {
    ctx.warnings.add({
      level: 'warn',
      code: 'sliding_panels',
      nodeId: node.id,
      message: 'Una corredera necesita al menos dos paños: agrega una hoja.',
    })
  }
  if (spec.panels.length > MAX_SLIDING_PANELS) {
    ctx.warnings.add({
      level: 'warn',
      code: 'sliding_too_many_panels',
      nodeId: node.id,
      message: `Una corredera se fabrica con hasta ${MAX_SLIDING_PANELS} hojas: con ${spec.panels.length} conviene dividirla en dos ventanas acopladas.`,
      params: { count: spec.panels.length, max: MAX_SLIDING_PANELS },
    })
  }
  if (spec.panels.length > 0 && !spec.panels.some((p) => p.panel.kind !== 'fixed')) {
    ctx.warnings.add({
      level: 'warn',
      code: 'sliding_no_moving',
      nodeId: node.id,
      message: 'Esta corredera no tiene hojas móviles: marca al menos una hoja como móvil.',
    })
  }
  if (spec.rails === 1) {
    // OT 385 V3: el monorriel tiene constantes propias no derivables de la pauta (research 06 §5.2).
    ctx.warnings.add({
      level: 'info',
      code: 'sliding_mono_estimated',
      nodeId: node.id,
      message: 'Monorriel calculado con la pauta general de corredera: contrasta hojas y vidrios con la plantilla de tu proveedor antes de cortar.',
    })
  }
  const interlock = spec.panels.length > 1 ? requireProfile(ctx, 'interlock') : undefined
  for (const p of spec.panels) {
    const id = p.panel.id
    if (p.glass.w <= 0 || p.glass.h <= 0) {
      ctx.warnings.add({
        level: 'error',
        code: 'pane_impossible',
        nodeId: id,
        message: `${capitalize(p.label.long)} no cabe: la corredera es muy angosta para ${spec.panels.length} hojas.`,
        params: { ...paneParams(p.label.ref), variant: 'sliding', panels: spec.panels.length },
      })
      continue
    }
    b.sashCount++
    b.cut({ kind: 'profile', role: 'sliding_sash', profile: spec.profile, length: p.cut.w, qty: 2, angles: [45, 45], side: 'top', label: 'arr/aba', nodeId: id })
    b.reinforce(spec.profile, base.reinforcement?.sash, base.weld, p.cut.w, 2, 'top', 'arr/aba', id)
    b.cut({ kind: 'profile', role: 'sliding_sash', profile: spec.profile, length: p.cut.h, qty: 2, angles: [45, 45], side: 'left', label: 'izq/der', nodeId: id })
    b.reinforce(spec.profile, base.reinforcement?.sash, base.weld, p.cut.h, 2, 'left', 'izq/der', id)
    if (p.meetings > 0) {
      // Traslapo: alto nominal de la hoja, uno por cada encuentro con una vecina (OT 385: 1047).
      // En una guillotina el encuentro es horizontal: ancho nominal.
      const meeting = ctx.isVerticalSlide ? p.nominal.w : p.nominal.h
      b.cut({ kind: 'profile', role: 'interlock', profile: interlock, length: meeting, qty: p.meetings, angles: [90, 90], side: 'interlock', label: 'traslapo', nodeId: id })
      if (interlock?.reinforcementId) b.reinforce(interlock, base.reinforcement?.mullion, 0, meeting, p.meetings, 'interlock', 'traslapo', id)
    }
    addBeads(b, ctx, p.bead.w, p.bead.h, id, p.glassId)
    b.addGlass(p.glassId, p.glass.w, p.glass.h, id, p.label)
    const fixed = p.panel.kind === 'fixed'
    b.hardwareTargets.push({
      nodeId: id,
      label: p.label,
      kind: ctx.isLiftSlide ? (fixed ? 'lift_slide_fixed' : 'lift_slide_moving') : ctx.isVerticalSlide ? (fixed ? 'vertical_fixed' : 'vertical_moving') : fixed ? 'sliding_fixed' : 'sliding_moving',
      w: p.nominal.w,
      h: p.nominal.h,
      limit: fixed || ctx.isVerticalSlide ? undefined : ctx.isLiftSlide ? 'lift_slide' : 'sliding',
    })
    checkSmall(ctx, p.glass.w, p.glass.h, p.label, id)
  }
  // Guía: luz de ancho, una por riel (OT 385: 1371 × 2).
  const guide = profileForRole(ctx, 'guide')
  if (guide) {
    // Guillotina: las guías van en las jambas (una por lado).
    const length = ctx.isVerticalSlide ? spec.luz.h : spec.luz.w
    b.cut({ kind: 'profile', role: 'guide', profile: guide, length, qty: ctx.isVerticalSlide ? 2 : spec.rails, angles: [90, 90], side: 'guide', label: 'guía', nodeId: 'frame' })
  }
}

// ─── Piezas de contorno (premarco, ensanche, vierteaguas) ───────────────────

/**
 * Perfiles de contorno elegidos del catálogo. Sin pauta del fabricante para estas piezas: premarco
 * como un marco (cota + soldadura, a 45°), ensanche por lado a 90° y vierteaguas al ancho exterior.
 * Si el perfil ya no está en la línea, se avisa y no se corta.
 */
function addFrameAddons(ctx: EngineContext, b: BomBuilder): void {
  const list = ctx.design.extras?.frameAddons
  if (!Array.isArray(list) || list.length === 0) return
  const { W, H } = ctx
  const weld = ctx.base.weld
  for (const addon of list) {
    const profile = addon?.profileId ? ctx.profiles.get(addon.profileId) : undefined
    if (!profile || profile.lineId !== ctx.design.lineId) {
      ctx.warnings.add(
        { level: 'warn', code: 'frame_addon_missing', message: `Una pieza de contorno ya no está en ${ctx.lineName}: no se cortó ni se cobró. Elige otra.`, params: { line: ctx.lineName } },
        `frame_addon_missing|${addon?.profileId ?? ''}`,
      )
      continue
    }
    const piece = { kind: 'profile' as const, role: 'other' as const, profile, nodeId: 'frame' }
    if (addon.kind === 'subframe') {
      b.cut({ ...piece, length: W + 2 * weld, qty: 2, angles: [45, 45], side: 'top', label: 'premarco arr/aba' })
      b.cut({ ...piece, length: H + 2 * weld, qty: 2, angles: [45, 45], side: 'left', label: 'premarco izq/der' })
    } else if (addon.kind === 'sill_profile') {
      b.cut({ ...piece, length: W, qty: 1, angles: [90, 90], side: 'bottom', label: 'vierteaguas' })
    } else {
      const sides = Array.isArray(addon.sides) && addon.sides.length ? addon.sides : (['left', 'right', 'top'] as const)
      const across = sides.filter((s) => s === 'top' || s === 'bottom').length
      const along = sides.filter((s) => s === 'left' || s === 'right').length
      if (across) b.cut({ ...piece, length: W, qty: across, angles: [90, 90], side: 'top', label: 'ensanche' })
      if (along) b.cut({ ...piece, length: H, qty: along, angles: [90, 90], side: 'left', label: 'ensanche' })
    }
  }
}

// ─── Herrajes y accesorios ──────────────────────────────────────────────────

function addHardware(ctx: EngineContext, b: BomBuilder): void {
  const rules = ctx.line?.hardwareRules ?? []
  const openingTargets = b.hardwareTargets.filter((t) => !FIXED_TARGETS.has(t.kind))
  if (!ctx.line) return
  if (rules.length === 0) {
    if (openingTargets.length > 0) {
      ctx.warnings.add({
        level: 'info',
        code: 'hardware_missing',
        message: `${ctx.line.name} no tiene reglas de herrajes en el catálogo: la ventana queda fuera del total hasta tenerlas.`,
        params: { variant: 'rules', line: ctx.line.name },
      })
    }
    return
  }
  // Hojas sin herraje para su medida: un aviso por medida (las hojas iguales se agrupan).
  const gaps = new Map<string, { dim: Dimension; value: number; ranges: HardwareRange[]; nodeIds: Id[] }>()
  const noteGap = (dim: Dimension, value: number, ranges: HardwareRange[], nodeId: Id): void => {
    const key = `${dim}|${fmtMm(value)}|${ranges.map(([min, max]) => `${min ?? ''}-${max ?? ''}`).join(',')}`
    const gap = gaps.get(key)
    if (gap) gap.nodeIds.push(nodeId)
    else gaps.set(key, { dim, value, ranges, nodeIds: [nodeId] })
  }
  for (const t of b.hardwareTargets) {
    const ev = evaluateHardware(rules, t.kind, t.w, t.h, { passive: t.passive, sequence: t.sequence })
    const opens = !FIXED_TARGETS.has(t.kind)
    if (opens && ev.noRules) {
      ctx.warnings.add(
        {
          level: 'info',
          code: 'hardware_missing',
          message: `${ctx.line.name} no tiene herrajes para ${HARDWARE_KIND_NAMES[t.kind]}: la ventana queda fuera del total hasta agregarlos en el catálogo.`,
          params: { variant: 'target', line: ctx.line.name, target: t.kind },
        },
        `hardware_missing|${t.kind}`,
      )
    }
    if (opens && ev.heightGap) noteGap('height', t.h, ev.heightGap, t.nodeId)
    if (opens && ev.widthGap) noteGap('width', t.w, ev.widthGap, t.nodeId)
    for (const m of ev.matched) b.addItem(variantItemId(ctx, m.rule, 'interior'), m.qty, 'hardware', t.nodeId)
  }
  for (const gap of gaps.values()) {
    const n = gap.nodeIds.length
    const message =
      `No hay herraje de ${ctx.line.name} para hojas de ${fmtMm(gap.value)} de ${gap.dim === 'width' ? 'ancho' : 'alto'} (${gapText(gap.ranges, gap.value)}). ` +
      (n > 1 ? `Las ${n} hojas quedan fuera del total.` : 'Queda fuera del total.')
    ctx.warnings.add({
      level: 'warn',
      code: 'hardware_out_of_range',
      message,
      ...(n === 1 ? { nodeId: gap.nodeIds[0] } : {}),
      params: { line: ctx.line.name, size: gap.value, dim: gap.dim, count: n, ...gapCoverage(gap.ranges, gap.value) },
    })
  }
}

const FIXED_TARGETS = new Set<HardwareTargetKind>(['fixed', 'sliding_fixed', 'lift_slide_fixed', 'vertical_fixed'])

const COUNTABLE_UNITS = new Set(['u', 'kit', 'par'])

function isCountable(item: Item | undefined): boolean {
  return !item || COUNTABLE_UNITS.has(item.unit) || (item.packSize ?? 0) > 1
}

const ceilQty = (n: number): number => Math.ceil(n - 1e-9)
const ceil2 = (n: number): number => Math.ceil(n * 100 - 1e-6) / 100

/** Extras pedidos en el diseño y las variantes que los describen (tipo, accionamiento). */
function requestedExtras(ctx: EngineContext): Map<ExtraKind, string[]> {
  const out = new Map<ExtraKind, string[]>()
  const { extras } = ctx
  if (extras.rollerShutter) out.set('rollerShutter', [extras.rollerShutter.type, extras.rollerShutter.operation])
  if (extras.insectScreen) out.set('insectScreen', [extras.insectScreen.type])
  if (extras.sill) out.set('sill', [])
  // El umbral solo cuenta si de verdad se puso (puerta al piso con perfil de umbral, o elevadora).
  if (ctx.threshold) out.set('threshold', [])
  return out
}

function ruleForExtras(rule: AccessoryRule, requested: Map<ExtraKind, string[]>): boolean {
  if (!rule.extra) return true
  const variants = requested.get(rule.extra)
  if (!variants) return false
  const wanted = Array.isArray(rule.variants) ? rule.variants.filter(Boolean) : []
  return wanted.length === 0 || wanted.some((v) => variants.includes(v))
}

const EXTRA_NAMES: Record<ExtraKind, string> = {
  rollerShutter: 'persianas',
  insectScreen: 'mosquiteros',
  sill: 'alféizares',
  threshold: 'umbrales',
}

function addAccessories(ctx: EngineContext, b: BomBuilder): void {
  const all = ctx.line?.accessoryRules ?? []
  const requested = requestedExtras(ctx)
  // Extras pedidos sin ninguna regla que los cotice: se avisa (no entran al costo).
  if (ctx.line) {
    for (const [extra] of requested) {
      if (extra === 'threshold') continue
      if (!all.some((rule) => rule.extra === extra && ruleForExtras(rule, requested))) {
        ctx.warnings.add(
          {
            level: 'info',
            code: 'extra_rules_missing',
            message: `${ctx.line.name} no tiene precios para ${EXTRA_NAMES[extra]} en el catálogo: se dibuja, pero la ventana queda fuera del total. Agrégalos en Catálogo › Accesorios.`,
            params: { line: ctx.line.name, extra },
          },
          `extra_rules_missing|${extra}`,
        )
      }
    }
  }
  // Paneles ciegos sin ninguna regla que los cotice: se dibujan y se listan, pero no entran al costo.
  const louvers = b.panels.filter((p) => p.kind === 'louver')
  const blinds = b.panels.filter((p) => p.kind !== 'louver')
  if (ctx.line && louvers.length > 0 && !all.some((rule) => rule.scope === 'louvers')) {
    ctx.warnings.add(
      {
        level: 'info',
        code: 'louver_rules_missing',
        message: `${ctx.line.name} no tiene precio para celosías en el catálogo: se dibujan, pero la ventana queda fuera del total. Agrégalo en Catálogo › Accesorios.`,
        params: { line: ctx.line.name },
      },
      'louver_rules_missing',
    )
  }
  if (ctx.line && blinds.length > 0 && !all.some((rule) => rule.scope === 'panels')) {
    ctx.warnings.add(
      {
        level: 'info',
        code: 'panel_rules_missing',
        message: `${ctx.line.name} no tiene precio para paneles ciegos en el catálogo: se dibujan, pero la ventana queda fuera del total. Agrégalo en Catálogo › Accesorios.`,
        params: { line: ctx.line.name },
      },
      'panel_rules_missing',
    )
  }
  const rules = all.filter((rule) => ruleForExtras(rule, requested))
  if (rules.length === 0) return
  const allCuts = [...b.profiles, ...b.steel]
  const frameMm = b.profiles
    .filter((c) => c.role === 'frame' || c.role === 'sliding_frame' || c.role === 'mullion' || c.role === 'threshold')
    .reduce((a, c) => a + c.length * c.qty, 0)
  const glassMm = b.glass.reduce((a, g) => a + 2 * (g.width + g.height) * g.qty, 0)
  const perimeterMm = ctx.shape ? ctx.shape.perimeter : 2 * (ctx.W + ctx.H)
  // Travesaños fijos (los conectores metálicos van de a 2 por travesaño); la unión francesa no cuenta.
  const mullions = ctx.tree.dividers.filter((d) => d.kind === 'mullion').length
  // Paneles ciegos: lo que cuentan las reglas `scope: 'panels'` (cero si no hay).
  const statsOf = (list: PanelPiece[]) => ({
    count: list.reduce((a, p) => a + p.qty, 0),
    areaM2: list.reduce((a, p) => a + p.area * p.qty, 0),
    widthMm: list.reduce((a, p) => a + p.width * p.qty, 0),
    heightMm: list.reduce((a, p) => a + p.height * p.qty, 0),
    perimeterMm: list.reduce((a, p) => a + 2 * (p.width + p.height) * p.qty, 0),
  })
  const blindStats = statsOf(blinds)
  const louverStats = statsOf(louvers)
  for (const rule of rules) {
    const itemId = variantItemId(ctx, rule, 'exterior')
    const item = ctx.items.get(itemId)
    const countable = isCountable(item)
    const per = Number.isFinite(rule.qty) ? rule.qty : 0
    let qty = 0
    if (rule.scope === 'panels' || rule.scope === 'louvers') {
      const panelStats = rule.scope === 'louvers' ? louverStats : blindStats
      switch (rule.per) {
        case 'window':
        case 'sash':
          qty = per * panelStats.count
          break
        case 'area_m2':
          qty = per * panelStats.areaM2
          break
        case 'width_m':
          qty = (per * panelStats.widthMm) / 1000
          break
        case 'height_m':
          qty = (per * panelStats.heightMm) / 1000
          break
        case 'perimeter_m':
        case 'glass_m':
          qty = (per * panelStats.perimeterMm) / 1000
          break
        default:
          warnUnknownRule(ctx, rule, item)
      }
      b.addItem(itemId, countable ? ceilQty(qty) : ceil2(qty), item?.kind ?? 'accessory')
      continue
    }
    switch (rule.per) {
      case 'window':
        qty = per
        break
      case 'sash':
        qty = per * b.sashCount
        break
      case 'mullion':
        qty = per * mullions
        break
      case 'glass_m':
        qty = (per * glassMm) / 1000
        break
      case 'frame_m':
        qty = (per * frameMm) / 1000
        break
      case 'perimeter_m':
        qty = (per * perimeterMm) / 1000
        break
      case 'width_m':
        qty = (per * ctx.W) / 1000
        break
      case 'height_m':
        qty = (per * ctx.H) / 1000
        break
      case 'area_m2':
        qty = (per * ctx.W * ctx.H) / 1e6
        break
      case 'coupler_m':
        // Se cuenta en las uniones del conjunto (ver `assemblyBom`), no en cada ventana.
        continue
      case 'reinforcement_m':
        // Tornillos de refuerzo: se redondea hacia arriba por cada pieza de acero.
        qty = allCuts
          .filter((c) => c.kind === 'reinforcement')
          .reduce((a, c) => a + (countable ? ceilQty((c.length / 1000) * per) : (c.length / 1000) * per) * c.qty, 0)
        break
      default:
        warnUnknownRule(ctx, rule, item)
    }
    qty = countable ? ceilQty(qty) : ceil2(qty)
    b.addItem(itemId, qty, item?.kind ?? 'accessory')
  }
}

/** Dato de catálogo que el motor no sabe contar: se avisa en vez de cotizar 0 en silencio. */
function warnUnknownRule(ctx: EngineContext, rule: AccessoryRule, item: Item | undefined): void {
  ctx.warnings.add(
    {
      level: 'info',
      code: 'accessory_rule_unknown',
      message: `La regla de ${item?.name ?? 'un accesorio'} en ${ctx.lineName} no dice cómo se cuenta: no entra al costo. Revísala en Catálogo.`,
      params: { line: ctx.lineName, ...(item ? { item: item.name } : {}) },
    },
    `accessory_rule_unknown|${rule.id}`,
  )
}

// ─── Avisos ─────────────────────────────────────────────────────────────────

/** Cómo nombra el aviso a cada clase de hoja («el rango típico de una hoja abatible…»). */
export const OPENING_LIMIT_NAMES: Record<OpeningLimitClass, string> = {
  casement: 'una hoja abatible',
  casement_out: 'una hoja abatible exterior',
  awning: 'una proyectante',
  tilt_turn: 'una oscilobatiente',
  tilt_turn_door: 'una puerta oscilobatiente',
  door: 'una hoja de puerta',
  tilt: 'una oscilante',
  pivot_h: 'una pivotante horizontal',
  pivot_v: 'una pivotante vertical',
  tilt_slide: 'una osciloparalela',
  parallel_slide: 'una corredera paralela',
  folding: 'una hoja plegable',
  folding_access: 'la hoja de paso de un plegable',
  sliding: 'una hoja de corredera',
  lift_slide: 'una hoja elevadora',
}

const n0 = (n: number): string => formatNumber(n, 0)

/** Perfil de estanqueidad de la línea (el catálogo lo trae como «other»). */
function sealProfile(ctx: EngineContext): Profile | undefined {
  return ctx.catalog.profiles.find((p) => p.lineId === ctx.line?.id && p.role === 'other' && /estanq/i.test(p.name ?? ''))
}

/** Datos publicados por el fabricante (`provenance`): espesor de vidrio admitido y límites de hoja. */
function checkSupplierData(ctx: EngineContext, b: BomBuilder): void {
  const provenance = ctx.line?.provenance
  if (!provenance) return
  const range = provenance.glazing
  if (range) {
    for (const g of b.glass) {
      const thickness = ctx.glasses.get(g.glassId)?.thickness
      if (!thickness || (thickness >= range.min && thickness <= range.max)) continue
      ctx.warnings.add(
        {
          level: 'warn',
          code: 'glazing_out_of_range',
          nodeId: g.nodeId,
          message: `${ctx.lineName} admite vidrios de ${n0(range.min)} a ${n0(range.max)} mm: uno de ${n0(thickness)} mm no cabe.`,
          params: { line: ctx.lineName, thickness, min: range.min, max: range.max },
        },
        `glazing_out_of_range|${thickness}`,
      )
    }
  }
  for (const t of b.hardwareTargets) {
    const lim = provenance.limits?.find((l) => l.opening === t.kind)
    if (!lim) continue
    const [minW, maxW] = lim.width
    const [minH, maxH] = lim.height
    if (t.w >= minW - 0.05 && t.w <= maxW + 0.05 && t.h >= minH - 0.05 && t.h <= maxH + 0.05) continue
    ctx.warnings.add({
      level: 'warn',
      code: 'supplier_limit_exceeded',
      nodeId: t.nodeId,
      message: `${capitalize(t.label.long)} mide ${n0(t.w)} × ${n0(t.h)} mm: ${ctx.lineName} publica de ${n0(minW)} a ${n0(maxW)} mm de ancho y de ${n0(minH)} a ${n0(maxH)} mm de alto.`,
      params: { ...paneParams(t.label.ref), line: ctx.lineName, width: t.w, height: t.h, minW, maxW, minH, maxH },
    })
  }
}

/**
 * Hojas fuera del rango indicativo de su herraje (OPENING_SIZE_LIMITS, research 25 §4.1) y
 * conjuntos más anchos que lo publicado (plegable, elevadora). Avisos, nunca bloqueos.
 */
function checkLimits(ctx: EngineContext, b: BomBuilder): void {
  checkSupplierData(ctx, b)
  for (const t of b.hardwareTargets) {
    if (!t.limit) continue
    const lim = OPENING_SIZE_LIMITS[t.limit]
    const tooLarge = t.w > lim.maxW + 0.05 || t.h > lim.maxH + 0.05
    const tooSmall = t.w < lim.minW - 0.05 || t.h < lim.minH - 0.05
    if (!tooLarge && !tooSmall) continue
    const params: OpeningLimitParams = {
      ...paneParams(t.label.ref),
      limit: t.limit,
      width: t.w,
      height: t.h,
      minW: lim.minW,
      maxW: lim.maxW,
      minH: lim.minH,
      maxH: lim.maxH,
    }
    ctx.warnings.add({
      level: 'warn',
      code: tooLarge ? 'opening_too_large' : 'opening_too_small',
      nodeId: t.nodeId,
      params,
      message:
        `${capitalize(t.label.long)} mide ${n0(t.w)} × ${n0(t.h)} mm (hoja terminada): el rango típico de ${OPENING_LIMIT_NAMES[t.limit]} es de ` +
        `${n0(lim.minW)} a ${n0(lim.maxW)} mm de ancho y de ${n0(lim.minH)} a ${n0(lim.maxH)} mm de alto. Confírmalo con tu proveedor de herrajes.`,
    })
  }
  for (const split of ctx.tree.splits) {
    if (split.node.joint !== 'fold' || !ctx.tree.cells.some((c) => c.pair === 'fold' && c.path.includes(split.node.id))) continue
    const width = split.box.x1 - split.box.x0
    if (width > ELEMENT_MAX_WIDTH.folding + 0.05) {
      ctx.warnings.add({
        level: 'warn',
        code: 'element_too_large',
        nodeId: split.node.id,
        message: `El plegable mide ${n0(width)} mm de ancho: los sistemas publicados llegan a ${n0(ELEMENT_MAX_WIDTH.folding)} mm. Divídelo o confírmalo con tu proveedor.`,
        params: { kind: 'folding', width, max: ELEMENT_MAX_WIDTH.folding },
      })
    }
  }
  if (ctx.isLiftSlide && ctx.W > ELEMENT_MAX_WIDTH.lift_slide + 0.05) {
    ctx.warnings.add({
      level: 'warn',
      code: 'element_too_large',
      message: `La elevadora mide ${n0(ctx.W)} mm de ancho: los sistemas publicados llegan a ${n0(ELEMENT_MAX_WIDTH.lift_slide)} mm. Divídela o confírmalo con tu proveedor.`,
      params: { kind: 'lift_slide', width: ctx.W, max: ELEMENT_MAX_WIDTH.lift_slide },
    })
  }
}

function checkSmall(ctx: EngineContext, w: number, h: number, label: CellLabel, nodeId: Id): void {
  const min = Math.min(w, h)
  if (min > 0 && min < GLASS_LIMITS.minSide) {
    ctx.warnings.add({
      level: 'warn',
      code: 'pane_small',
      nodeId,
      message: `${capitalize(label.long)} queda con un vidrio de ${fmtMm(min)} de ${w <= h ? 'ancho' : 'alto'}: es muy chico para fabricarlo y sellarlo bien.`,
      params: { ...paneParams(label.ref), size: min, dim: w <= h ? 'width' : 'height' },
    })
  }
}

function checkGlassSize(ctx: EngineContext, glass: Glass | undefined, piece: GlassPiece, label: CellLabel): void {
  if (!glass) return
  const area = piece.realArea ?? piece.area
  if (glass.kind === 'dvh' && area > GLASS_LIMITS.dvhMaxArea) {
    ctx.warnings.add({
      level: 'warn',
      code: 'glass_too_big',
      nodeId: piece.nodeId,
      message: `El termopanel ${ofLabel(label.long)} mide ${fmtM2(area)}: sobre ${fmtM2(GLASS_LIMITS.dvhMaxArea)} es muy pesado para manipular e instalar. Divide el paño con un travesaño.`,
      params: { ...paneParams(label.ref), variant: 'dvh', area, max: GLASS_LIMITS.dvhMaxArea },
    })
  }
  if (glass.kind === 'mono' && glass.thickness > 0 && glass.thickness <= 4 && area > GLASS_LIMITS.mono4MaxArea) {
    const dvh = ctx.catalog.glass.find((g) => g.kind === 'dvh' || g.kind === 'laminated')
    ctx.warnings.add({
      level: 'warn',
      code: 'glass_too_big',
      nodeId: piece.nodeId,
      message: `El vidrio ${ofLabel(label.long)} mide ${fmtM2(area)}: un monolítico de ${glass.thickness} mm sobre ${fmtM2(GLASS_LIMITS.mono4MaxArea)} se puede quebrar. Usa uno más grueso, laminado o termopanel.`,
      params: { ...paneParams(label.ref), variant: 'mono', area, max: GLASS_LIMITS.mono4MaxArea, thickness: glass.thickness },
      fix: dvh ? { label: `Usar ${dvh.name}`, key: 'use', params: { name: dvh.name }, patch: { glassId: dvh.id } } : undefined,
    })
  }
}

function checkPrices(ctx: EngineContext, b: BomBuilder): void {
  const colorId = ctx.design.colorId
  const colorKnown = ctx.colors.has(colorId)
  const colorName = ctx.colors.get(colorId)?.name ?? 'ese color'
  const seen = new Set<string>()
  for (const c of [...b.profiles, ...b.beads, ...b.steel]) {
    if (!c.profileId || seen.has(c.profileId)) continue
    seen.add(c.profileId)
    const p = ctx.profiles.get(c.profileId)
    if (!p) continue
    const prices = p.priceByColor ?? {}
    const ok = c.kind === 'reinforcement' ? Object.values(prices).some((v) => v > 0) : (prices[colorId] ?? 0) > 0
    if (!ok) {
      ctx.warnings.add({
        level: 'warn',
        code: 'price_missing_profile',
        message:
          c.kind === 'reinforcement'
            ? `El refuerzo ${p.code} no tiene precio: queda fuera del total.`
            : `El perfil ${p.code} no tiene precio en ${colorName}: queda fuera del total.`,
        params:
          c.kind === 'reinforcement'
            ? { variant: 'reinforcement', code: p.code }
            : { variant: 'profile', code: p.code, ...(colorKnown ? { color: colorName } : {}) },
      })
    }
  }
  const glassSeen = new Set<Id>()
  for (const g of b.glass) {
    if (glassSeen.has(g.glassId)) continue
    glassSeen.add(g.glassId)
    const glass = ctx.glasses.get(g.glassId)
    if (glass && !(glass.pricePerM2 > 0)) {
      ctx.warnings.add({
        level: 'warn',
        code: 'price_missing_glass',
        message: `El vidrio ${glass.name} no tiene precio por m²: queda fuera del total.`,
        params: { glass: glass.name },
      })
    }
  }
  for (const line of b.items.values()) {
    const item = ctx.items.get(line.itemId)
    if (item && !(item.price > 0)) {
      const what = item.kind === 'hardware' ? 'El herraje' : item.kind === 'consumable' ? 'El insumo' : 'El accesorio'
      ctx.warnings.add(
        {
          level: 'warn',
          code: 'price_missing_item',
          message: `${what} ${item.code} · ${item.name} no tiene precio: queda fuera del total.`,
          params: { kind: item.kind, code: item.code, name: item.name },
        },
        `price_missing_item|${item.id}`,
      )
    }
  }
}

// ─── Peso estimado ──────────────────────────────────────────────────────────

/** Espesor neto de vidrio (suma de cristales): «4+12+4» → 8; «3+3» → 6. */
export function glassNetThickness(glass: Glass | undefined): number {
  if (!glass) return 0
  const src = `${glass.composition ?? ''} ${glass.name ?? ''}`
  const nums = (src.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => parseFloat(n.replace(',', '.'))).filter((n) => n >= 1)
  if (glass.kind === 'dvh') {
    const panes = nums.filter((_, i) => i % 2 === 0)
    if (nums.length >= 3) return panes.reduce((a, n) => a + n, 0)
    return glass.thickness > 12 ? glass.thickness - 12 : 8
  }
  if (glass.kind === 'laminated' && nums.length >= 2) return nums.slice(0, 2).reduce((a, n) => a + n, 0)
  return glass.thickness > 0 ? glass.thickness : nums[0] ?? 4
}

function estimateWeight(ctx: EngineContext, cuts: CutPiece[], glass: GlassPiece[]): number {
  let kg = 0
  for (const c of cuts) {
    const p = c.profileId ? ctx.profiles.get(c.profileId) : undefined
    const perM =
      p?.weightKgM && p.weightKgM > 0
        ? p.weightKgM
        : c.role === 'bead'
          ? DEFAULT_WEIGHTS.beadKgM
          : c.role === 'reinforcement'
            ? DEFAULT_WEIGHTS.steelKgM
            : c.role === 'guide'
              ? DEFAULT_WEIGHTS.aluminumKgM
              : DEFAULT_WEIGHTS.pvcKgM
    kg += (c.length / 1000) * c.qty * perM
  }
  for (const g of glass) {
    const gl = ctx.glasses.get(g.glassId)
    const perM2 = gl?.weightKgM2 && gl.weightKgM2 > 0 ? gl.weightKgM2 : glassNetThickness(gl) * DEFAULT_WEIGHTS.glassKgM2PerMm
    kg += (g.realArea ?? g.area) * g.qty * perM2
  }
  return kg
}
