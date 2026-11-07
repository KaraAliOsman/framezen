import type { Translation } from '@dekopen/shared'
import type es from './es'

const it: Translation<typeof es> = {
  title: 'Preventivo {number}',
  windows: '{count, plural, =0 {Ancora nessuna finestra} one {# finestra} other {# finestre}}',
  total: 'Totale <b>{total}</b> + IVA',
  help: 'Controlla la <link>guida alle misure</link> prima di inviare.',
  undo: { resize: 'Cambia misura in {size}' },
}

export default it
