/**
 * Rutas con llaves secretas en el camino: el enlace de invitación (/api/invitations/:token) y el
 * del portal del cliente (/api/public/quotes/:token). Quien lee los logs (la plataforma, un log
 * drain) no debe poder copiarlos: se escriben como «:token».
 */
const SECRET_SEGMENTS = [/^(\/api\/invitations\/)[^/]+/, /^(\/api\/public\/quotes\/)[^/]+/, /^(\/api\/public\/pay\/flow\/(?:confirm|return)\/)[^/]+/, /^(\/api\/public\/ar\/)[^/]+/]

export function redactPath(path: string): string {
  for (const pattern of SECRET_SEGMENTS) if (pattern.test(path)) return path.replace(pattern, '$1:token')
  return path
}
