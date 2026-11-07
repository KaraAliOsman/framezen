/**
 * npm run ai:setup: conecta cualquier API compatible con OpenAI. Pide la dirección, la clave (sin
 * mostrarla) y el modelo, los guarda en `.env` (cambia solo esas líneas) y comprueba la conexión.
 *
 * También acepta la clave por una tubería, nunca como argumento: los argumentos quedan en el
 * historial de la terminal. Por tubería, la dirección y el modelo salen de `.env` o del entorno.
 */
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { findRepoRoot } from '../apps/server/src/config'
import { describeProbe, runCheck } from '../apps/server/src/services/ai/check-report'
import { isTokenPlanCredential, providerProfile } from '../apps/server/src/services/ai/config'
import { looksLikeKey, readHidden, writeEnvValue } from '../apps/server/src/services/ai/env-file'
import { loadRootEnv } from '../apps/server/src/load-env'

// Antes de cargar .env: lo que esté aquí es una variable real, que el servidor preferirá.
const shellKey = process.env.AI_API_KEY?.trim()
const envPath = process.env.DEKOPEN_ENV_FILE ? resolve(process.env.DEKOPEN_ENV_FILE) : resolve(findRepoRoot(), '.env')
const interactive = Boolean(process.stdin.isTTY)
loadRootEnv(dirname(envPath))

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function readPiped(): Promise<string> {
  return new Promise((done) => {
    const lines = createInterface({ input: process.stdin })
    let first = ''
    lines.once('line', (line) => {
      first = line
      lines.close()
    })
    lines.once('close', () => done(first))
  })
}

async function ask(label: string, current?: string): Promise<string> {
  const lines = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>((done) => lines.question(`${label}${current ? ` [${current}]` : ''}: `, done))
  lines.close()
  return answer.trim() || current || ''
}

/** Modelos que ofrece el proveedor. Una lista vacía no es un error: no todos tienen esa ruta. */
async function listModels(baseUrl: string, key: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) })
    if (!response.ok) return []
    const body = (await response.json()) as { data?: { id?: unknown }[] }
    return (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string')
  } catch {
    return []
  }
}

console.log('Conecta la IA de DEKOPEN. Sirve cualquier API compatible con OpenAI.')

const baseUrl = (interactive ? await ask('Dirección de la API, termina en /v1', process.env.AI_BASE_URL?.trim()) : (process.env.AI_BASE_URL?.trim() ?? '')).replace(/\/+$/, '')
if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) fail('Falta la dirección de la API (AI_BASE_URL), por ejemplo https://api.tu-proveedor.com/v1. No cambié nada.')

const { keysUrl } = providerProfile(baseUrl)
if (keysUrl) console.log(`Crea una clave de pago por uso en ${keysUrl}.`)
const typed = interactive ? await readHidden(process.stdin, process.stdout, 'Pega la clave y presiona Enter (no se verá): ') : await readPiped()
if (typed === null) fail('Cancelado. No cambié nada.')
const key = typed.trim()

if (!key) fail('No recibí ninguna clave. No cambié nada.')
if (isTokenPlanCredential(key, baseUrl)) fail('Esa clave es de Token Plan y ese proveedor no permite usarla en un backend. No cambié nada: crea una de pago por uso.')
if (!looksLikeKey(key)) fail('Eso no parece una clave: debe ser una sola línea, sin espacios ni comillas. No cambié nada.')

let model = process.env.AI_MODEL?.trim() ?? ''
if (interactive) {
  const offered = await listModels(baseUrl, key)
  if (offered.length) console.log(`Modelos disponibles:\n${offered.map((id) => `  ${id}`).join('\n')}`)
  model = await ask('Modelo', model || offered[0])
}
if (!model) fail('Falta el modelo (AI_MODEL). No cambié nada.')

writeEnvValue(envPath, 'AI_BASE_URL', baseUrl)
writeEnvValue(envPath, 'AI_MODEL', model)
writeEnvValue(envPath, 'AI_API_KEY', key)
console.log(process.env.DEKOPEN_ENV_FILE ? 'Conexión guardada.' : 'Conexión guardada en .env (ignorado por git).')

if (shellKey && shellKey !== key) console.log('Ojo: hay una AI_API_KEY en el entorno de esta terminal y el servidor la preferirá sobre .env. Bórrala para usar la nueva.')

const { probe } = await runCheck({ env: { ...process.env, AI_BASE_URL: baseUrl, AI_MODEL: model, AI_API_KEY: key } })
console.log(describeProbe(probe, baseUrl))
if (probe.state === 'connected') {
  console.log('Si npm run dev ya estaba corriendo, se reinicia solo con la clave nueva.')
  console.log('Para probar herramientas, JSON e imagen corre: npm run ai:check -- --full')
} else {
  process.exitCode = 1
}
