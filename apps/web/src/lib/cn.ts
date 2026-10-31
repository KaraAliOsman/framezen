import { clsx, type ClassValue } from 'clsx'

/** Une clases condicionales. Las clases del llamador van al final. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}
