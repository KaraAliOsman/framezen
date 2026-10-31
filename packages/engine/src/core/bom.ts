import type {
  Bom,
  Catalog,
  ColorVariants,
  CutPiece,
  Glass,
  GlassPiece,
  HardwareUnit,
  Id,
  Item,
  ItemLine,
  Profile,
  ProfileRole,
  Shape,
  Side,
  Warning,
  WindowDesign,
} from '../types'
import { createContext, profileForRole, requireProfile, ROLE_NAMES, type EngineContext } from './context'
import { DEFAULT_BAR_LENGTH, DEFAULT_WEIGHTS, GLASS_LIMITS } from './defaults'
import { fmtM2, fmtMm, mm1, round } from './format'
import { evaluateHardware, gapText, HARDWARE_KIND_NAMES, type HardwareRange, type HardwareTargetKind } from './hardware'
import { cellSpecs, slidingSpec, type CellLabel, type CellSpec, type SashSpec } from './specs'

/**
 * Despiece de una ventana: cortes de perfiles (marco y hojas a 45°, travesaños, guías y
 * traslapos a 90°), junquillos, refuerzos por pieza, vidrios, herrajes por regla y
 * accesorios. Nunca lanza: lo que falta se informa como aviso y el resto se calcula igual.
 */
export function computeBom(design: WindowDesign, catalog: Catalog): Bom {
  const ctx = createContext(design, catalog)
  const b = new BomBuilder(ctx)
  const { W, H } = ctx
  if (W > 0 && H > 0) {
    addFrame(ctx, b)
    if (ctx.tree.sliding) addSliding(ctx, b)
    else addTree(ctx, b)
    addHardware(ctx, b)
    addAccessories(ctx, b)
    checkPrices(ctx, b)
  }
  const cuts = [...b.profiles, ...b.beads, ...b.steel]
  const perimeterMm = ctx.shape ? ctx.shape.perimeter : 2 * (W + H)
  return {
    cuts,
    glass: b.glass,
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
  readonly items = new Map<string, ItemLine>()
  /** Hojas y paneles (para accesorios «por hoja»). */
  sashCount = 0
  readonly hardwareTargets: {
    nodeId: Id
    label: CellLabel
    kind: HardwareTargetKind
    w: number
    h: number
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
      barLength: p?.barLength && p.barLength > 0 ? p.barLength : DEFAULT_BAR_LENGTH,
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
    const parentName = parent?.code ?? 'la pieza'
    let ded = deduction
    if (ded === undefined) {
      ded = 2 * weld + 30
      this.ctx.warnings.add(
        {
          level: 'info',
          code: 'reinforcement_deduction_missing',
          message: `${parentName} lleva refuerzo, pero la pauta no indica cuánto descontarle: usamos corte − ${fmtMm(ded)}.`,
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
        },
        `reinforcement_profile_missing|${parentName}`,
      )
    }
    const length = mm1(corte - ded)
    if (!(length > 0)) return
    this.cut({
      kind: 'reinforcement',
      role: 'reinforcement',
      profile: steel ?? { ...placeholderSteel, name: `Refuerzo de ${parentName}` },
      length,
      qty,
      angles: [90, 90],
      side,
      label,
      nodeId,
    })
  }

  addGlass(glassId: Id, w: number, h: number, nodeId: Id, label: CellLabel, shape?: Shape['kind']): void {
    const ctx = this.ctx
    if (!(w > 0) || !(h > 0)) return
    const glass = ctx.glasses.get(glassId)
    if (!glass) {
      ctx.warnings.add(
        {
          level: 'warn',
          code: 'glass_missing',
          message: 'El vidrio elegido no está en el catálogo: se lista sin precio. Elige un vidrio para cotizarlo.',
          fix: ctx.catalog.glass[0] ? { label: `Usar ${ctx.catalog.glass[0].name}`, patch: { glassId: ctx.catalog.glass[0].id } } : undefined,
        },
        `glass_missing|${glassId}`,
      )
    }
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
    this.glass.push(piece)
    checkGlassSize(ctx, glass, piece, label)
  }

  addItem(itemId: Id, qty: number, kindFallback: Item['kind'], nodeId?: Id): void {
    if (!(qty > 0)) return
    const item = this.ctx.items.get(itemId)
    if (!item) {
      this.ctx.warnings.add(
        {
          level: 'warn',
          code: 'item_missing',
          message: `${kindFallback === 'hardware' ? 'Un herraje' : 'Un accesorio'} de ${this.ctx.lineName} (código ${itemId}) no está en el catálogo: no entra al costo.`,
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
  if ((item.packSize ?? 0) > 1) return item.unit === 'm' ? 'm' : 'u'
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
  barLength: DEFAULT_BAR_LENGTH,
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
    b.reinforce(profile, ded, w, mm1(H + w), 2, 'left', 'izq/der', 'frame')
    b.cut({
      kind: 'profile',
      role: 'threshold',
      profile: ctx.threshold,
      length: W - 2 * ctx.frameFace,
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
  for (const d of ctx.tree.dividers) {
    if (d.kind !== 'mullion') continue
    const vertical = d.dir === 'vertical'
    // El travesaño cruza su región completa: borde exterior del marco o eje del travesaño vecino.
    const length = vertical ? d.box.y1 - d.box.y0 : d.box.x1 - d.box.x0
    const side: Side = vertical ? 'mullion' : 'transom'
    b.cut({ kind: 'profile', role: 'mullion', profile: mullionProfile, length, qty: 1, angles: [90, 90], side, label: 'trav', nodeId: d.node.id })
    b.reinforce(mullionProfile, base.reinforcement?.mullion, 0, mm1(length), 1, side, 'trav', d.node.id)
  }

  const specs = cellSpecs(ctx)
  const singleShape = !!ctx.shape && specs.length === 1 && specs[0].type === 'fixed'
  for (const spec of specs) {
    if (!paneFits(ctx, spec)) continue
    if (spec.type === 'fixed') {
      b.hardwareTargets.push({ nodeId: spec.nodeId, label: spec.label, kind: 'fixed', w: spec.luz.w, h: spec.luz.h })
      if (singleShape && ctx.shape) {
        addShapePane(ctx, b, spec)
        continue
      }
      addBeads(b, ctx, spec.bead.w, spec.bead.h, spec.nodeId)
      if (spec.fill === 'glass') b.addGlass(spec.glassId, spec.glass.w, spec.glass.h, spec.nodeId, spec.label)
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
    })
    return false
  }
  return true
}

function addBeads(b: BomBuilder, ctx: EngineContext, w: number, h: number, nodeId: Id): void {
  const bead = requireProfile(ctx, 'bead')
  b.cut({ kind: 'bead', role: 'bead', profile: bead, length: w, qty: 2, angles: [45, 45], side: 'top', label: 'arr/aba', nodeId })
  b.cut({ kind: 'bead', role: 'bead', profile: bead, length: h, qty: 2, angles: [45, 45], side: 'left', label: 'izq/der', nodeId })
}

function addShapePane(ctx: EngineContext, b: BomBuilder, spec: CellSpec): void {
  const shape = ctx.shape
  if (!shape) return
  const bead = requireProfile(ctx, 'bead')
  const fd = ctx.base.frameDeduction
  // Junquillo y vidrio siguen el contorno real (no el rectángulo envolvente).
  for (const e of shape.inset(fd).edges) {
    b.cut({ kind: 'bead', role: 'bead', profile: bead, length: e.length, qty: 1, angles: [e.angleStart, e.angleEnd], side: e.side, label: e.label, nodeId: spec.nodeId })
  }
  if (spec.fill !== 'glass') return
  const g = shape.inset(fd + ctx.base.glassGap).bbox
  b.addGlass(spec.glassId, g.w, g.h, spec.nodeId, spec.label, shape.kind)
  checkSmall(ctx, g.w, g.h, spec.label, spec.nodeId)
}

function addSash(ctx: EngineContext, b: BomBuilder, spec: SashSpec): void {
  const { pauta, profile, role, cut, nodeId } = spec
  b.sashCount++
  b.cut({ kind: 'profile', role, profile, length: cut.w, qty: 2, angles: [45, 45], side: 'top', label: 'arr/aba', nodeId })
  b.reinforce(profile, pauta.reinforcement?.sash, pauta.weld, cut.w, 2, 'top', 'arr/aba', nodeId)
  b.cut({ kind: 'profile', role, profile, length: cut.h, qty: 2, angles: [45, 45], side: 'left', label: 'izq/der', nodeId })
  b.reinforce(profile, pauta.reinforcement?.sash, pauta.weld, cut.h, 2, 'left', 'izq/der', nodeId)
  if (spec.passive) {
    // Inversor en la hoja pasiva: largo = alto nominal de la hoja, a 90° (supuesto sin dato OT).
    const inv = requireProfile(ctx, 'french_mullion')
    b.cut({ kind: 'profile', role: 'french_mullion', profile: inv, length: spec.nominal.h, qty: 1, angles: [90, 90], side: 'other', label: 'inversor', nodeId })
    if (inv?.reinforcementId) b.reinforce(inv, ctx.base.reinforcement?.mullion, 0, spec.nominal.h, 1, 'other', 'inversor', nodeId)
  }
  addBeads(b, ctx, spec.bead.w, spec.bead.h, nodeId)
  if (spec.fill === 'glass') b.addGlass(spec.glassId, spec.glass.w, spec.glass.h, nodeId, spec.label)
  b.hardwareTargets.push({ nodeId, label: spec.label, kind: spec.opening.kind, w: spec.nominal.w, h: spec.nominal.h })
  checkSmall(ctx, spec.glass.w, spec.glass.h, spec.label, nodeId)
}

// ─── Corredera ──────────────────────────────────────────────────────────────

function addSliding(ctx: EngineContext, b: BomBuilder): void {
  const spec = slidingSpec(ctx)
  const node = ctx.tree.sliding
  if (!spec || !node) return
  const { base } = ctx
  if (spec.panels.length < 2) {
    ctx.warnings.add({
      level: 'warn',
      code: 'sliding_panels',
      nodeId: node.id,
      message: 'Una corredera necesita al menos dos paños: agrega una hoja.',
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
      b.cut({ kind: 'profile', role: 'interlock', profile: interlock, length: p.nominal.h, qty: p.meetings, angles: [90, 90], side: 'interlock', label: 'traslapo', nodeId: id })
      if (interlock?.reinforcementId) b.reinforce(interlock, base.reinforcement?.mullion, 0, p.nominal.h, p.meetings, 'interlock', 'traslapo', id)
    }
    addBeads(b, ctx, p.bead.w, p.bead.h, id)
    b.addGlass(p.glassId, p.glass.w, p.glass.h, id, p.label)
    b.hardwareTargets.push({
      nodeId: id,
      label: p.label,
      kind: p.panel.kind === 'fixed' ? 'sliding_fixed' : 'sliding_moving',
      w: p.nominal.w,
      h: p.nominal.h,
    })
    checkSmall(ctx, p.glass.w, p.glass.h, p.label, id)
  }
  // Guía: luz de ancho, una por riel (OT 385: 1371 × 2).
  const guide = profileForRole(ctx, 'guide')
  if (guide) {
    b.cut({ kind: 'profile', role: 'guide', profile: guide, length: spec.luz.w, qty: spec.rails, angles: [90, 90], side: 'guide', label: 'guía', nodeId: 'frame' })
  }
}

// ─── Herrajes y accesorios ──────────────────────────────────────────────────

function addHardware(ctx: EngineContext, b: BomBuilder): void {
  const rules = ctx.line?.hardwareRules ?? []
  const openingTargets = b.hardwareTargets.filter((t) => t.kind !== 'fixed' && t.kind !== 'sliding_fixed')
  if (!ctx.line) return
  if (rules.length === 0) {
    if (openingTargets.length > 0) {
      ctx.warnings.add({
        level: 'info',
        code: 'hardware_missing',
        message: `${ctx.line.name} no tiene reglas de herrajes en el catálogo: la ventana se cotiza sin herrajes.`,
      })
    }
    return
  }
  // Hojas sin herraje para su medida: un aviso por medida (las hojas iguales se agrupan).
  const gaps = new Map<string, { dim: 'alto' | 'ancho'; value: number; ranges: HardwareRange[]; nodeIds: Id[] }>()
  const noteGap = (dim: 'alto' | 'ancho', value: number, ranges: HardwareRange[], nodeId: Id): void => {
    const key = `${dim}|${fmtMm(value)}|${ranges.map(([min, max]) => `${min ?? ''}-${max ?? ''}`).join(',')}`
    const gap = gaps.get(key)
    if (gap) gap.nodeIds.push(nodeId)
    else gaps.set(key, { dim, value, ranges, nodeIds: [nodeId] })
  }
  for (const t of b.hardwareTargets) {
    const ev = evaluateHardware(rules, t.kind, t.w, t.h)
    const opens = t.kind !== 'fixed' && t.kind !== 'sliding_fixed'
    if (opens && ev.noRules) {
      ctx.warnings.add(
        {
          level: 'info',
          code: 'hardware_missing',
          message: `${ctx.line.name} no tiene herrajes para ${HARDWARE_KIND_NAMES[t.kind]}: agrégalos en el catálogo para que entren al costo.`,
        },
        `hardware_missing|${t.kind}`,
      )
    }
    if (opens && ev.heightGap) noteGap('alto', t.h, ev.heightGap, t.nodeId)
    if (opens && ev.widthGap) noteGap('ancho', t.w, ev.widthGap, t.nodeId)
    for (const m of ev.matched) b.addItem(variantItemId(ctx, m.rule, 'interior'), m.qty, 'hardware', t.nodeId)
  }
  for (const gap of gaps.values()) {
    const n = gap.nodeIds.length
    const warning: Warning = {
      level: 'warn',
      code: 'hardware_out_of_range',
      message:
        `No hay herraje de ${ctx.line.name} para hojas de ${fmtMm(gap.value)} de ${gap.dim} (${gapText(gap.ranges, gap.value)}). ` +
        (n > 1 ? `Las ${n} hojas se cotizan sin él.` : 'Se cotiza sin él.'),
    }
    if (n === 1) warning.nodeId = gap.nodeIds[0]
    ctx.warnings.add(warning)
  }
}

const COUNTABLE_UNITS = new Set(['u', 'kit', 'par'])

function isCountable(item: Item | undefined): boolean {
  return !item || COUNTABLE_UNITS.has(item.unit) || (item.packSize ?? 0) > 1
}

const ceilQty = (n: number): number => Math.ceil(n - 1e-9)
const ceil2 = (n: number): number => Math.ceil(n * 100 - 1e-6) / 100

function addAccessories(ctx: EngineContext, b: BomBuilder): void {
  const rules = ctx.line?.accessoryRules ?? []
  if (rules.length === 0) return
  const allCuts = [...b.profiles, ...b.steel]
  const frameMm = b.profiles
    .filter((c) => c.role === 'frame' || c.role === 'sliding_frame' || c.role === 'mullion' || c.role === 'threshold')
    .reduce((a, c) => a + c.length * c.qty, 0)
  const glassMm = b.glass.reduce((a, g) => a + 2 * (g.width + g.height) * g.qty, 0)
  const perimeterMm = ctx.shape ? ctx.shape.perimeter : 2 * (ctx.W + ctx.H)
  // Travesaños fijos (los conectores metálicos van de a 2 por travesaño); la unión francesa no cuenta.
  const mullions = ctx.tree.dividers.filter((d) => d.kind === 'mullion').length
  for (const rule of rules) {
    const itemId = variantItemId(ctx, rule, 'exterior')
    const item = ctx.items.get(itemId)
    const countable = isCountable(item)
    const per = Number.isFinite(rule.qty) ? rule.qty : 0
    let qty = 0
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
      case 'reinforcement_m':
        // Tornillos de refuerzo: se redondea hacia arriba por cada pieza de acero.
        qty = allCuts
          .filter((c) => c.kind === 'reinforcement')
          .reduce((a, c) => a + (countable ? ceilQty((c.length / 1000) * per) : (c.length / 1000) * per) * c.qty, 0)
        break
      default:
        // Dato de catálogo que el motor no sabe contar: se avisa en vez de cotizar 0 en silencio.
        ctx.warnings.add(
          {
            level: 'info',
            code: 'accessory_rule_unknown',
            message: `La regla de ${item?.name ?? 'un accesorio'} en ${ctx.lineName} no dice cómo se cuenta: no entra al costo. Revísala en Catálogo.`,
          },
          `accessory_rule_unknown|${rule.id}`,
        )
    }
    qty = countable ? ceilQty(qty) : ceil2(qty)
    b.addItem(itemId, qty, item?.kind ?? 'accessory')
  }
}

// ─── Avisos ─────────────────────────────────────────────────────────────────

function checkSmall(ctx: EngineContext, w: number, h: number, label: CellLabel, nodeId: Id): void {
  const min = Math.min(w, h)
  if (min > 0 && min < GLASS_LIMITS.minSide) {
    ctx.warnings.add({
      level: 'warn',
      code: 'pane_small',
      nodeId,
      message: `${capitalize(label.long)} queda con un vidrio de ${fmtMm(min)} de ${w <= h ? 'ancho' : 'alto'}: es muy chico para fabricarlo y sellarlo bien.`,
    })
  }
}

function checkGlassSize(ctx: EngineContext, glass: Glass | undefined, piece: GlassPiece, label: CellLabel): void {
  if (!glass) return
  if (glass.kind === 'dvh' && piece.area > GLASS_LIMITS.dvhMaxArea) {
    ctx.warnings.add({
      level: 'warn',
      code: 'glass_too_big',
      nodeId: piece.nodeId,
      message: `El termopanel ${ofLabel(label.long)} mide ${fmtM2(piece.area)}: sobre ${fmtM2(GLASS_LIMITS.dvhMaxArea)} es muy pesado para manipular e instalar. Divide el paño con un travesaño.`,
    })
  }
  if (glass.kind === 'mono' && glass.thickness > 0 && glass.thickness <= 4 && piece.area > GLASS_LIMITS.mono4MaxArea) {
    const dvh = ctx.catalog.glass.find((g) => g.kind === 'dvh' || g.kind === 'laminated')
    ctx.warnings.add({
      level: 'warn',
      code: 'glass_too_big',
      nodeId: piece.nodeId,
      message: `El vidrio ${ofLabel(label.long)} mide ${fmtM2(piece.area)}: un monolítico de ${glass.thickness} mm sobre ${fmtM2(GLASS_LIMITS.mono4MaxArea)} se puede quebrar. Usa uno más grueso, laminado o termopanel.`,
      fix: dvh ? { label: `Usar ${dvh.name}`, patch: { glassId: dvh.id } } : undefined,
    })
  }
}

function checkPrices(ctx: EngineContext, b: BomBuilder): void {
  const colorId = ctx.design.colorId
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
            ? `El refuerzo ${p.code} no tiene precio: se cotiza en $0.`
            : `El perfil ${p.code} no tiene precio en ${colorName}: se cotiza en $0.`,
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
        message: `El vidrio ${glass.name} no tiene precio por m²: se cotiza en $0.`,
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
          message: `${what} ${item.code} · ${item.name} no tiene precio: se cotiza en $0.`,
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
    kg += g.area * g.qty * perM2
  }
  return kg
}
