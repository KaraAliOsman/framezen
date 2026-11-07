import type { Translation } from '@dekopen/shared'
import type es from './es'

const fr: Translation<typeof es> = {
  title: 'Devis {number}',
  windows: '{count, plural, =0 {Aucune fenêtre pour l’instant} one {# fenêtre} other {# fenêtres}}',
  total: 'Total <b>{total}</b> HT',
  help: 'Consultez le <link>guide de prise de cotes</link> avant d’envoyer.',
  undo: { resize: 'Passer les dimensions à {size}' },
}

export default fr
