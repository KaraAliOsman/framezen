/**
 * Diccionario de mensajes del intérprete local: español (fuente y respaldo) + 6 idiomas, todos con
 * la misma forma (tsc avisa si falta o sobra una clave).
 */
import { defineDictionary } from '../../i18n/translator'
import de from './de'
import en from './en'
import es from './es'
import fr from './fr'
import it from './it'
import pt from './pt'
import tr from './tr'

export const nluMessages = defineDictionary({ es, en, pt, fr, de, it, tr })
