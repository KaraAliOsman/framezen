import type { Translation } from '@dekopen/shared'
import type es from './es'

const tr: Translation<typeof es> = {
  title: 'Teklif {number}',
  windows: '{count, plural, =0 {Henüz pencere yok} one {# pencere} other {# pencere}}',
  total: 'Toplam <b>{total}</b> + KDV',
  help: 'Göndermeden önce <link>ölçü kılavuzunu</link> inceleyin.',
  undo: { resize: 'Ölçüyü {size} yap' },
}

export default tr
