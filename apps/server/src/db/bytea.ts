/**
 * Columna bytea para drizzle (pg-core no trae un constructor propio). Normaliza lo que entrega
 * cada driver a Buffer: PGlite devuelve Uint8Array, postgres-js Buffer y, con algunos tipos de
 * conexión, Postgres puede devolver el formato texto «\x…» (hex).
 */
import { customType } from 'drizzle-orm/pg-core'

export function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  if (value instanceof ArrayBuffer) return Buffer.from(value)
  if (typeof value === 'string') {
    if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex')
    return Buffer.from(value, 'latin1')
  }
  if (Array.isArray(value)) return Buffer.from(value as number[])
  throw new TypeError('bytea: valor no binario')
}

export const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array | string }>({
  dataType: () => 'bytea',
  toDriver: (value: Buffer | Uint8Array) => (Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength)),
  fromDriver: (value: unknown) => toBuffer(value),
})
