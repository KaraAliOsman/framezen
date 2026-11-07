import type { Translation } from '@dekopen/shared'
import type es from './es'

const de: Translation<typeof es> = {
  title: 'Angebot {number}',
  windows: '{count, plural, =0 {Noch keine Fenster} one {# Fenster} other {# Fenster}}',
  total: 'Gesamt <b>{total}</b> zzgl. MwSt.',
  help: 'Prüfen Sie vor dem Senden die <link>Aufmaß-Anleitung</link>.',
  undo: { resize: 'Maß auf {size} ändern' },
}

export default de
