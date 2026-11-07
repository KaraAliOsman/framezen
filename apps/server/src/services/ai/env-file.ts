/**
 * Escritura de `.env` para `npm run ai:setup`: cambia una sola variable y deja intactas las demás
 * líneas, comentarios y finales de línea. Nunca imprime ni devuelve el contenido.
 */
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

const lineFor = (name: string) => new RegExp(`^(\\s*(?:export\\s+)?)${name}\\s*=.*$`)

/** Texto con `name=value`: reemplaza la primera línea de esa variable o agrega una al final. */
export function upsertEnvValue(text: string, name: string, value: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.length ? text.split(/\r?\n/) : []
  const matcher = lineFor(name)
  const index = lines.findIndex((line) => matcher.test(line))
  if (index >= 0) {
    lines[index] = lines[index]!.replace(matcher, (_, prefix: string) => `${prefix}${name}=${value}`)
    return lines.join(eol)
  }
  if (lines.at(-1) === '') lines.pop()
  return [...lines, `${name}=${value}`, ''].join(eol)
}

/** Guarda en forma atómica (archivo temporal + renombrar) y con permisos solo del dueño. */
export function writeEnvValue(path: string, name: string, value: string): void {
  const before = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, upsertEnvValue(before, name, value), { mode: 0o600 })
  renameSync(temporary, path)
  try {
    chmodSync(path, 0o600)
  } catch {
    // En Windows los permisos POSIX no aplican: ahí protege la carpeta del usuario.
  }
}

export interface HiddenInput {
  setRawMode(mode: boolean): unknown
  resume(): unknown
  pause(): unknown
  setEncoding(encoding: BufferEncoding): unknown
  on(event: 'data', listener: (chunk: string) => void): unknown
  off(event: 'data', listener: (chunk: string) => void): unknown
}

/**
 * Lee una línea desde una terminal sin eco: en modo crudo la terminal no repite lo tecleado y aquí
 * tampoco se escribe nada. null = la persona canceló con Ctrl+C.
 */
export function readHidden(input: HiddenInput, output: { write(text: string): unknown }, prompt: string): Promise<string | null> {
  output.write(prompt)
  input.setRawMode(true)
  input.setEncoding('utf8')
  input.resume()
  return new Promise((resolve) => {
    let value = ''
    const finish = (result: string | null) => {
      input.setRawMode(false)
      input.pause()
      input.off('data', onData)
      output.write('\n')
      resolve(result)
    }
    const onData = (chunk: string) => {
      // Al pegar, algunas terminales envuelven el texto en ESC[200~ … ESC[201~.
      for (const char of chunk.replace(/\u001b\[20[01]~/g, '')) {
        if (char === '\u0003') return finish(null)
        if (char === '\r' || char === '\n' || char === '\u0004') return finish(value)
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else if (char >= ' ') value += char
      }
    }
    input.on('data', onData)
  })
}

/** Una clave válida para `.env`: una sola línea, sin espacios ni comillas. */
export function looksLikeKey(value: string): boolean {
  return /^[^\s"'#=]{8,512}$/.test(value)
}
