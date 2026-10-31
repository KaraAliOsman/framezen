/** Une clases condicionales (el paquete documents no depende de clsx). */
export function clsx(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(' ')
}
