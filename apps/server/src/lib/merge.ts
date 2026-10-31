export type DeepPartial<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> | null } : T

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Mezcla profunda: los objetos se mezclan, los arreglos y valores se reemplazan,
 * `undefined` se ignora y `null` borra la clave (para limpiar textos opcionales).
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (value === null) delete out[key]
    else if (isPlainObject(value) && isPlainObject(out[key])) out[key] = deepMerge(out[key], value)
    else out[key] = value
  }
  return out as T
}

/** Quita claves con undefined/null (para respuestas limpias). */
export function compact<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) if (v !== undefined && v !== null) out[key] = v
  return out as T
}
