/**
 * Fechas de calendario en hora de Chile: el servidor puede correr en UTC (contenedor), pero
 * «vendido del mes» se cuenta según el mes que vive el taller.
 */
export const CHILE_TZ = 'America/Santiago'

/** Desfase (ms) de la zona respecto de UTC en ese instante (Chile: −3 h o −4 h). */
export function zoneOffsetMs(at: Date, timeZone = CHILE_TZ): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  return asUtc - (at.getTime() - at.getUTCMilliseconds())
}

/**
 * Instante en que empieza (00:00 hora local) el mes calendario que contiene `now`, corrido
 * `offset` meses (−1 = el mes anterior, +1 = el siguiente).
 */
export function monthStartInZone(now: Date, offset = 0, timeZone = CHILE_TZ): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  const midnightUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1 + offset, 1)
  // 00:00 local = 00:00 UTC − desfase; se repite una vez por si el desfase cambia ese día (horario de verano).
  let t = midnightUtc - zoneOffsetMs(new Date(midnightUtc), timeZone)
  t = midnightUtc - zoneOffsetMs(new Date(t), timeZone)
  return new Date(t)
}
