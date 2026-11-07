/**
 * Diccionario de los documentos de taller en los 7 idiomas (completos: el paquete no usa
 * `import.meta.glob`; el idioma llega por props o por los datos de la OT).
 */
import { defineDictionary } from '@dekopen/shared'
import es from './es'
import en from './en'
import pt from './pt'
import fr from './fr'
import de from './de'
import it from './it'
import tr from './tr'

export const WORKSHOP_MESSAGES = defineDictionary({ es, en, pt, fr, de, it, tr })

export type WorkshopMessages = typeof es
