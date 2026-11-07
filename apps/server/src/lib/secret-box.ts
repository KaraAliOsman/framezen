/**
 * Cifrado de secretos en la base (AES-256-GCM). La clave maestra vive solo en el entorno
 * (PAYMENT_KEYS_SECRET); de ella sale una clave por organización, y cada valor queda atado a su
 * campo: copiar un texto cifrado a otra fila u otra organización no lo descifra.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const VERSION = 'v1'
const IV_BYTES = 12

function keyFor(master: string, orgId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', master, orgId, 'dekopen/payment-keys', 32))
}

export function sealSecret(plain: string, master: string, orgId: string, field: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', keyFor(master, orgId), iv)
  cipher.setAAD(Buffer.from(`${orgId}:${field}`))
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

/** Lanza si el texto fue alterado o no corresponde a esta organización y campo. */
export function openSecret(sealed: string, master: string, orgId: string, field: string): string {
  const [version, iv, tag, data] = sealed.split('.')
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Secreto en un formato desconocido')
  const decipher = createDecipheriv('aes-256-gcm', keyFor(master, orgId), Buffer.from(iv, 'base64url'))
  decipher.setAAD(Buffer.from(`${orgId}:${field}`))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}
