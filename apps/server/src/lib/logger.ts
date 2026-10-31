/** Logs legibles para la consola: hora, nivel y mensaje. */
export interface Logger {
  info: (message: string, extra?: unknown) => void
  warn: (message: string, extra?: unknown) => void
  error: (message: string, extra?: unknown) => void
}

const time = () => new Date().toTimeString().slice(0, 8)

export function createLogger(enabled = true): Logger {
  if (!enabled) return { info: () => {}, warn: () => {}, error: (m, e) => console.error(`${time()} ✖ ${m}`, e ?? '') }
  return {
    info: (m, e) => (e === undefined ? console.log(`${time()}   ${m}`) : console.log(`${time()}   ${m}`, e)),
    warn: (m, e) => (e === undefined ? console.warn(`${time()} ! ${m}`) : console.warn(`${time()} ! ${m}`, e)),
    error: (m, e) => console.error(`${time()} ✖ ${m}`, e ?? ''),
  }
}

export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} }
