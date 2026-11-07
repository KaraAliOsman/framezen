import type { Translation } from '@dekopen/shared'
import type es from './es'

const pt: Translation<typeof es> = {
  title: 'Orçamento {number}',
  windows: '{count, plural, =0 {Ainda sem janelas} one {# janela} other {# janelas}}',
  total: 'Total <b>{total}</b> + impostos',
  help: 'Confira o <link>guia de medidas</link> antes de enviar.',
  undo: { resize: 'Alterar medida para {size}' },
}

export default pt
