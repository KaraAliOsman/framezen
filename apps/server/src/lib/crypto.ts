import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 }

function scryptAsync(password: string, salt: Buffer, keyLen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keyLen, options, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

/** Hash de contraseña con scrypt: "scrypt$N$r$p$salt$hash" (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password.normalize('NFKC'), salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$')
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64url')
  const key = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/** Hash ficticio para igualar tiempos cuando el correo no existe. */
let dummyHash: Promise<string> | undefined
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(12).toString('hex'))
  return dummyHash
}

/** Token aleatorio para cookies y enlaces (se guarda sólo su SHA-256). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function newId(): string {
  return randomUUID()
}

/** Id corto para piezas internas del documento (ítems, extras). */
export function shortId(): string {
  return randomBytes(6).toString('base64url')
}
