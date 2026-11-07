import type { Translation } from '@dekopen/shared'
import type es from './es'

const en: Translation<typeof es> = {
  title: 'Quote {number}',
  windows: '{count, plural, =0 {No windows yet} one {# window} other {# windows}}',
  total: 'Total <b>{total}</b> + tax',
  help: 'Check the <link>measuring guide</link> before sending.',
  undo: { resize: 'Change size to {size}' },
}

export default en
