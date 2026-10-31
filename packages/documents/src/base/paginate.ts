/**
 * Paginación determinista: cada plantilla describe bloques con su alto estimado
 * (px) y aquí se reparten en hojas de tamaño fijo. Así la vista previa y el PDF
 * cortan exactamente igual y el pie puede decir «Página 2 de 3».
 */

export interface FlowBlock<T = unknown> {
  key: string
  /** Alto estimado en px (incluye márgenes propios del bloque). */
  height: number
  data: T
  /** Si no cabe junto al siguiente, ambos pasan a la hoja siguiente (títulos de sección). */
  keepWithNext?: boolean
  /** Fuerza hoja nueva antes de este bloque. */
  breakBefore?: boolean
}

export interface PageBudgets {
  /** Alto disponible en la primera hoja. */
  first: number
  /** Alto disponible en las hojas siguientes. */
  rest: number
}

export function paginate<T>(blocks: FlowBlock<T>[], budgets: PageBudgets): FlowBlock<T>[][] {
  const pages: FlowBlock<T>[][] = [[]]
  let used = 0
  const budget = () => (pages.length === 1 ? budgets.first : budgets.rest)
  const newPage = () => {
    pages.push([])
    used = 0
  }
  blocks.forEach((block, i) => {
    const current = pages[pages.length - 1]
    if (block.breakBefore && current.length > 0) newPage()
    const next = blocks[i + 1]
    const needed = block.height + (block.keepWithNext && next && !next.breakBefore ? next.height : 0)
    if (pages[pages.length - 1].length > 0 && used + needed > budget()) newPage()
    pages[pages.length - 1].push(block)
    used += block.height
  })
  return pages.filter((page, i) => page.length > 0 || i === 0)
}

/** Divide una lista en grupos de `size` (tarjetas por fila). */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += Math.max(1, size)) out.push(list.slice(i, i + Math.max(1, size)))
  return out
}
