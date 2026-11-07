import type { Translation } from '@dekopen/shared'
import type es from './es'

const de: Translation<typeof es> = {
  common: {
    close: 'Schließen',
    optional: '(optional)',
    loading: 'Wird geladen',
    retry: 'Erneut versuchen',
    undo: 'Rückgängig',
    selectPlaceholder: 'Option wählen',
    breadcrumbs: 'Pfad',
    toasts: 'Hinweise',
  },
  keys: {
    ctrl: 'Strg',
    alt: 'Alt',
    shift: 'Umschalt',
    delete: 'Entf',
    space: 'Leertaste',
    escape: 'Esc',
    enter: 'Enter',
  },
  combobox: {
    create: '<b>„{query}“</b> anlegen',
    placeholder: 'Auswählen oder eingeben…',
    search: 'Suchen…',
    empty: 'Keine Treffer.',
    clear: 'Auswahl aufheben',
  },
  palette: {
    title: 'Suche und Befehle',
    placeholder: 'Suchen oder Befehl eingeben…',
    noMatchesFor: 'Keine Treffer für „{query}“.',
    nothing: 'Nichts gefunden. Versuchen Sie ein anderes Wort.',
    askHeading: 'Assistent',
    ask: '{name} fragen: <b>„{query}“</b>',
    askGeneric: 'Den Assistenten fragen: <b>„{query}“</b>',
    open: 'öffnen',
    move: 'bewegen',
    toggle: 'öffnen und schließen',
  },
  table: {
    selectAll: 'Alle auswählen',
    selectRow: 'Zeile auswählen',
    edit: '{column} bearbeiten',
    editGeneric: 'Bearbeiten',
    noResultsFor: 'Keine Ergebnisse für „{query}“.',
    noneWithFilters: 'Keine {noun} für diese Filter.',
    nothingWithFilters: 'Nichts passt zu diesen Filtern.',
    clearFilters: 'Filter zurücksetzen',
    rows: '{count, plural, one {# Zeile} other {# Zeilen}}',
    selectedCount: '{items} ausgewählt',
    hiddenByFilters: 'Filter blenden {items} aus',
    bulkActions: 'Aktionen für die Auswahl',
    clearSelection: 'Auswahl aufheben',
  },
  error: {
    title: 'Dieser Bereich konnte nicht angezeigt werden',
    description: 'Ihre Daten sind sicher. Versuchen Sie es gleich noch einmal.',
  },
  save: {
    saving: 'Wird gespeichert…',
    saved: 'Gespeichert',
    savedAt: 'Gespeichert {when}',
    offline: 'Offline · Ihre Änderungen sind sicher',
    error: 'Speichern fehlgeschlagen · neuer Versuch läuft automatisch',
  },
  plan: {
    available: '{feature}: verfügbar im Tarif {plan}',
    badge: 'Tarif {plan}',
    see: 'Tarif {plan} ansehen',
    upgrade: 'Auf {plan} wechseln',
    price: 'Ab <b>{price}</b> zzgl. MwSt. pro Monat bei jährlicher Zahlung. Alles, was Sie schon haben, bleibt erhalten.',
    dismiss: 'Erklärung ausblenden',
  },
  kpi: {
    vsPrevious: 'Im Vergleich zum Vorzeitraum',
  },
}

export default de
