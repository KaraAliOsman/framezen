/**
 * Recetas: combinaciones ya pensadas de qué muestra cada ítem y cuánto precio se ve, para que nadie tenga
 * que tocar interruptor por interruptor. Una receta son operaciones normales: se puede deshacer y seguir
 * ajustando desde ahí.
 */
import { priceLevelOf, type DocOp, type ItemDisplay, type ItemsOptions, type PriceLevel } from '@dekopen/shared'

/** Datos por ítem que se encienden y apagan uno a uno. */
export const ITEM_FIELD_KEYS = [
  'showSpecs',
  'showRef',
  'showSize',
  'showQty',
  'showLocation',
  'showOpening',
  'showSystem',
  'showGlass',
  'showGlassImage',
  'showGlassBuildup',
  'showArea',
  'showAccessories',
  'showHardware',
  'showRoughOpening',
  'showSwatches',
  'showNotes',
  'showColorNote',
] as const satisfies readonly (keyof ItemsOptions)[]

export const DOC_RECIPES = ['complete', 'clean', 'totalOnly', 'schedule'] as const
export type DocRecipe = (typeof DOC_RECIPES)[number]

const RECIPES: Record<DocRecipe, { level: PriceLevel; display: ItemDisplay }> = {
  // Todo lo que un cliente exigente o un arquitecto quiere revisar.
  complete: {
    level: 'full',
    display: { showOpening: true, showSystem: true, showGlass: true, showGlassBuildup: true, showArea: true, showAccessories: true, showHardware: true, showNotes: true },
  },
  // Lo que un particular necesita para decidir.
  clean: {
    level: 'lines',
    display: { showOpening: true, showSystem: true, showGlass: true, showGlassBuildup: false, showArea: false, showAccessories: true, showHardware: false, showNotes: true },
  },
  // Sin precios por ítem: la cifra aparece una sola vez, en el cierre.
  totalOnly: {
    level: 'total',
    display: { showOpening: true, showSystem: true, showGlass: true, showGlassBuildup: false, showArea: false, showAccessories: true, showHardware: false, showNotes: true },
  },
  // Planilla de partidas para obra: medidas, cantidades y precios, sin descripciones largas.
  schedule: {
    level: 'full',
    display: { showOpening: false, showSystem: true, showGlass: true, showGlassBuildup: false, showArea: false, showAccessories: false, showHardware: false, showNotes: false },
  },
}

export function recipeOps(recipe: DocRecipe): DocOp[] {
  const r = RECIPES[recipe]
  return [{ op: 'setItemDisplay', patch: r.display } as DocOp, { op: 'setPriceLevel', level: r.level }]
}

/** La receta que coincide con las opciones actuales (ninguna si ya se ajustó a mano). */
export function activeRecipe(items: ItemsOptions): DocRecipe | undefined {
  return DOC_RECIPES.find((id) => {
    const r = RECIPES[id]
    return priceLevelOf(items) === r.level && Object.entries(r.display).every(([k, v]) => items[k as keyof ItemsOptions] === v)
  })
}
