/**
 * Carga `.env` de la raíz del monorepo. El servidor lo hace con `env-bootstrap.ts`, su primer import.
 *
 * - Lo que ya está en el entorno manda: `process.loadEnvFile` nunca pisa una variable existente, de
 *   modo que en producción (Railway, Docker) valen las variables reales aunque exista un archivo.
 * - Se busca desde la raíz, no desde el cwd: `npm run dev` corre con cwd en apps/server.
 * - Sin archivo no pasa nada: en producción lo normal es que no exista.
 */
import { join } from 'node:path'
import { findRepoRoot } from './config'

export type EnvFileResult = { loaded: true; path: string } | { loaded: false; path: string; reason: 'missing' | 'unreadable' }

export function loadRootEnv(root: string = findRepoRoot(), load: (path: string) => void = process.loadEnvFile): EnvFileResult {
  const path = join(root, '.env')
  try {
    load(path)
    return { loaded: true, path }
  } catch (error) {
    return { loaded: false, path, reason: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable' }
  }
}
