import type { Translation } from '@dekopen/shared'
import type es from './es'

const it: Translation<typeof es> = {
  common: {
    close: 'Chiudi',
    optional: '(facoltativo)',
    loading: 'Caricamento',
    retry: 'Riprova',
    undo: 'Annulla',
    selectPlaceholder: 'Scegli un’opzione',
    breadcrumbs: 'Percorso',
    toasts: 'Avvisi',
  },
  keys: {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Maiusc',
    delete: 'Canc',
    space: 'Spazio',
    escape: 'Esc',
    enter: 'Invio',
  },
  combobox: {
    create: 'Crea <b>«{query}»</b>',
    placeholder: 'Scegli o scrivi…',
    search: 'Cerca…',
    empty: 'Nessuna corrispondenza.',
    clear: 'Togli selezione',
  },
  palette: {
    title: 'Ricerca e comandi',
    placeholder: 'Cerca o scrivi un comando…',
    noMatchesFor: 'Nessuna corrispondenza per «{query}».',
    nothing: 'Niente qui. Prova con un’altra parola.',
    askHeading: 'Assistente',
    ask: 'Chiedi a {name}: <b>«{query}»</b>',
    askGeneric: 'Chiedi all’assistente: <b>«{query}»</b>',
    open: 'apri',
    move: 'spostati',
    toggle: 'apri e chiudi',
  },
  table: {
    selectAll: 'Seleziona tutte',
    selectRow: 'Seleziona riga',
    edit: 'Modifica {column}',
    editGeneric: 'Modifica',
    noResultsFor: 'Nessun risultato per «{query}».',
    noneWithFilters: 'Nessun risultato ({noun}) con questi filtri.',
    nothingWithFilters: 'Niente corrisponde a questi filtri.',
    clearFilters: 'Togli filtri',
    rows: '{count, plural, one {# riga} other {# righe}}',
    selectedCount: 'Selezione: {items}',
    hiddenByFilters: 'I filtri nascondono {items}',
    bulkActions: 'Azioni sulla selezione',
    clearSelection: 'Togli selezione',
  },
  error: {
    title: 'Non siamo riusciti a mostrare questa parte',
    description: 'I tuoi dati sono al sicuro. Riprova tra un momento.',
  },
  save: {
    saving: 'Salvataggio…',
    saved: 'Salvato',
    savedAt: 'Salvato {when}',
    offline: 'Offline · le tue modifiche sono al sicuro',
    error: 'Salvataggio non riuscito · riproviamo da soli',
  },
  plan: {
    available: '{feature}: disponibile con {plan}',
    badge: 'Piano {plan}',
    see: 'Vedi piano {plan}',
    upgrade: 'Passa a {plan}',
    price: 'Da <b>{price}</b> + IVA al mese con pagamento annuale. Tutto quello che hai già resta com’è.',
    dismiss: 'Nascondi spiegazione',
  },
  kpi: {
    vsPrevious: 'Rispetto al periodo precedente',
  },
}

export default it
