/**
 * Debe ser el PRIMER import de index.ts (y de los scripts): así las variables de `.env` existen
 * antes de que cualquier módulo lea `process.env`.
 */
import { loadRootEnv } from './load-env'

export const envFile = loadRootEnv()
