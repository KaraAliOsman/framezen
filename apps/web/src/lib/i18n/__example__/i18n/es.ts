/**
 * Ejemplo de espacio de nombres (referencia para la ola 1; no viaja a producción).
 * Fuente en español: textos literales, `as const`, exportación por defecto, sin importar código.
 */
const es = {
  title: 'Cotización {number}',
  windows: '{count, plural, =0 {Sin ventanas todavía} one {# ventana} other {# ventanas}}',
  total: 'Total <b>{total}</b> + IVA',
  help: 'Revisa la <link>guía de medidas</link> antes de enviar.',
  undo: {
    // Las etiquetas de deshacer se guardan por clave (estable) y se traducen al mostrarse.
    resize: 'Cambiar medida a {size}',
  },
} as const

export default es
