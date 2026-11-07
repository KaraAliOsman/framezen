/**
 * Modelos GLB de paso para Scene Viewer. Esa app de Android descarga el modelo desde una URL https (un
 * blob del navegador no le sirve), así que el portal deja aquí la ventana unos minutos. Vive solo en
 * memoria, con topes de tamaño y de cantidad, y la dirección es aleatoria e irrepetible.
 */
import type { AppDeps } from '../context'
import { randomToken } from '../lib/crypto'

/** Debajo del tope de cuerpo de la API (6 MB). */
export const AR_MODEL_MAX_BYTES = 5 * 1024 * 1024
const TTL_MS = 10 * 60_000
const MAX_TOTAL_BYTES = 64 * 1024 * 1024

interface Entry {
  bytes: Uint8Array
  expires: number
}

/** ¿Es de verdad un GLB v2? Cabecera, largo declarado y primer bloque JSON. Nada más se publica. */
export function isGlb(bytes: Uint8Array): boolean {
  if (bytes.length < 20) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const MAGIC_GLTF = 0x46546c67
  const CHUNK_JSON = 0x4e4f534a
  return view.getUint32(0, true) === MAGIC_GLTF && view.getUint32(4, true) === 2 && view.getUint32(8, true) === bytes.length && view.getUint32(16, true) === CHUNK_JSON
}

export class ArModelStore {
  private readonly entries = new Map<string, Entry>()
  private total = 0

  constructor(private readonly now: () => number) {}

  put(bytes: Uint8Array): string {
    this.sweep()
    // Lo más antiguo sale primero: un Map conserva el orden de llegada.
    for (const id of [...this.entries.keys()]) {
      if (this.total + bytes.length <= MAX_TOTAL_BYTES) break
      this.remove(id)
    }
    const id = randomToken(18)
    this.entries.set(id, { bytes, expires: this.now() + TTL_MS })
    this.total += bytes.length
    return id
  }

  get(id: string): Uint8Array | undefined {
    this.sweep()
    return this.entries.get(id)?.bytes
  }

  private remove(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    this.total -= entry.bytes.length
    this.entries.delete(id)
  }

  private sweep(): void {
    const t = this.now()
    for (const [id, entry] of this.entries) if (entry.expires <= t) this.remove(id)
  }
}

const stores = new WeakMap<AppDeps, ArModelStore>()

export function arModels(deps: AppDeps): ArModelStore {
  let store = stores.get(deps)
  if (!store) {
    store = new ArModelStore(() => deps.now().getTime())
    stores.set(deps, store)
  }
  return store
}
