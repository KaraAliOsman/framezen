/** Esquemas zod compartidos entre rutas (mensajes en español). */
import { z } from 'zod'

export const emailSchema = z
  .string({ error: 'Falta el correo.' })
  .trim()
  .toLowerCase()
  .min(3, 'Escribe tu correo.')
  .max(254, 'El correo es demasiado largo.')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Ese correo no parece válido. Revisa que tenga @ y un dominio.')

export const passwordSchema = z
  .string({ error: 'Falta la contraseña.' })
  .min(8, 'Usa una contraseña de al menos 8 caracteres.')
  .max(200, 'La contraseña es demasiado larga.')

export const nameSchema = z.string({ error: 'Falta tu nombre.' }).trim().min(1, 'Escribe tu nombre.').max(120, 'El nombre es demasiado largo.')

/** Texto opcional: sin enviar = undefined (no se toca); '' o null = se borra (null). */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Este texto admite hasta ${max} caracteres.`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v : null))

export const roleSchema = z.enum(['owner', 'estimator', 'workshop', 'operator', 'installer'], {
  error: 'Ese rol no existe. Elige Dueño, Cotizador, Jefe de taller, Operario o Instalador.',
})

export const quoteStatusSchema = z.enum(['draft', 'sent', 'accepted', 'rejected', 'workshop', 'installed', 'closed'], {
  error: 'Ese estado de cotización no existe.',
})

export const stationSchema = z.enum(['cut', 'weld', 'assembly', 'hardware', 'glazing', 'qc', 'ready', 'installed'], {
  error: 'Esa estación no existe.',
})

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'El color debe tener el formato #RRGGBB.')
