import es from './es'
import type { GlossaryMessages } from './helpers'

/**
 * Árbol español del glosario (la web lo registra como espacio de nombres con idiomas bajo demanda).
 * Archivo aparte: así la web no arrastra los 7 idiomas del glosario estático en su paquete inicial.
 */
export const glossarySource: GlossaryMessages = es
