/**
 * PGlite en disco a prueba de reinicios bruscos (desarrollo local en Windows).
 *
 * - Candado por proceso: dos servidores abriendo la misma carpeta la corrompen.
 * - Copia de seguridad comprimida al abrir, cada 10 minutos y al cerrar.
 * - Si la carpeta no abre, se aparta (nunca se borra) y se restaura la última copia.
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const SNAPSHOT_EVERY_MS = 10 * 60 * 1000
const FIRST_SNAPSHOT_DELAY_MS = 90 * 1000

export interface SafePglite {
  client: PGlite
  restored: 'none' | 'snapshot' | 'fresh'
  close: () => Promise<void>
}

function lockPath(dataDir: string) {
  return `${dataDir}.lock`
}

function snapshotPath(dataDir: string) {
  return `${dataDir}.snapshot.tar.gz`
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function acquireLock(dataDir: string) {
  const file = lockPath(dataDir)
  if (existsSync(file)) {
    const pid = Number(readFileSync(file, 'utf8').trim())
    if (pid && pid !== process.pid && isAlive(pid)) {
      throw new Error(
        `La base local ${dataDir} ya está abierta por otro proceso de DEKOPEN (PID ${pid}). Cierra ese servidor o usa otra carpeta con PGLITE_DIR.`,
      )
    }
  }
  writeFileSync(file, String(process.pid))
}

function releaseLock(dataDir: string) {
  const file = lockPath(dataDir)
  try {
    if (existsSync(file) && Number(readFileSync(file, 'utf8').trim()) === process.pid) rmSync(file)
  } catch {
    /* sin importancia */
  }
}

async function writeSnapshot(client: PGlite, dataDir: string) {
  const blob = await client.dumpDataDir('gzip')
  const tmp = `${snapshotPath(dataDir)}.tmp`
  writeFileSync(tmp, Buffer.from(await blob.arrayBuffer()))
  renameSync(tmp, snapshotPath(dataDir))
}

function setAside(dataDir: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = `${dataDir}-danada-${stamp}`
  renameSync(dataDir, target)
  return target
}

export async function openSafePglite(dataDir: string, log: (msg: string) => void = console.warn): Promise<SafePglite> {
  mkdirSync(dirname(dataDir), { recursive: true })
  acquireLock(dataDir)

  let client: PGlite
  let restored: SafePglite['restored'] = 'none'
  try {
    mkdirSync(dataDir, { recursive: true })
    client = await PGlite.create(dataDir)
    await client.query('select 1')
  } catch (error) {
    const aside = existsSync(dataDir) ? setAside(dataDir) : null
    const snap = snapshotPath(dataDir)
    if (existsSync(snap)) {
      log(
        `La base local no abrió (${(error as Error).message}). La aparté en ${aside} y restauré la última copia de seguridad.`,
      )
      const data = readFileSync(snap)
      client = await PGlite.create(dataDir, { loadDataDir: new Blob([data]) })
      restored = 'snapshot'
    } else {
      log(`La base local no abrió (${(error as Error).message}). La aparté en ${aside} y empecé una nueva.`)
      client = await PGlite.create(dataDir)
      restored = 'fresh'
    }
  }

  // Copia inicial y periódica. PGlite atiende una operación a la vez: si la copia (gzip de toda la
  // base) arranca junto con el servidor, las migraciones y el arranque esperan detrás de ella
  // (minutos con una base de desarrollo grande). Por eso la primera copia espera un poco.
  const snapshot = () => writeSnapshot(client, dataDir).catch((e) => log(`No se pudo guardar la copia de seguridad: ${e.message}`))
  const first = setTimeout(() => void snapshot(), FIRST_SNAPSHOT_DELAY_MS)
  first.unref()
  const timer = setInterval(snapshot, SNAPSHOT_EVERY_MS)
  timer.unref()

  const onExit = () => releaseLock(dataDir)
  process.once('exit', onExit)

  return {
    client,
    restored,
    close: async () => {
      clearTimeout(first)
      clearInterval(timer)
      await writeSnapshot(client, dataDir).catch(() => {})
      await client.close()
      releaseLock(dataDir)
      process.off('exit', onExit)
    },
  }
}
