import type { Translation } from '@dekopen/shared'
import type es from './es'

const en: Translation<typeof es> = {
  common: {
    close: 'Close',
    optional: '(optional)',
    loading: 'Loading',
    retry: 'Try again',
    undo: 'Undo',
    selectPlaceholder: 'Choose an option',
    breadcrumbs: 'Breadcrumb',
    toasts: 'Notifications',
  },
  keys: {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    delete: 'Del',
    space: 'Space',
    escape: 'Esc',
    enter: 'Enter',
  },
  combobox: {
    create: 'Create <b>“{query}”</b>',
    placeholder: 'Choose or type…',
    search: 'Search…',
    empty: 'No matches.',
    clear: 'Clear selection',
  },
  palette: {
    title: 'Search and commands',
    placeholder: 'Search or type a command…',
    noMatchesFor: 'No matches for “{query}”.',
    nothing: 'Nothing here. Try another word.',
    askHeading: 'Assistant',
    ask: 'Ask {name}: <b>“{query}”</b>',
    askGeneric: 'Ask the assistant: <b>“{query}”</b>',
    open: 'open',
    move: 'move',
    toggle: 'open and close',
  },
  table: {
    selectAll: 'Select all',
    selectRow: 'Select row',
    edit: 'Edit {column}',
    editGeneric: 'Edit',
    noResultsFor: 'No results for “{query}”.',
    noneWithFilters: 'No {noun} match these filters.',
    nothingWithFilters: 'Nothing matches these filters.',
    clearFilters: 'Clear filters',
    rows: '{count, plural, one {# row} other {# rows}}',
    selectedCount: '{items} selected',
    hiddenByFilters: 'Filters hide {items}',
    bulkActions: 'Actions for the selection',
    clearSelection: 'Clear selection',
  },
  error: {
    title: 'We couldn’t show this part',
    description: 'Your data is safe. Try again in a moment.',
  },
  save: {
    saving: 'Saving…',
    saved: 'Saved',
    savedAt: 'Saved {when}',
    offline: 'Offline · your changes are safe',
    error: 'Couldn’t save · we’ll retry automatically',
  },
  plan: {
    available: '{feature}: available on {plan}',
    badge: '{plan} plan',
    see: 'See {plan} plan',
    upgrade: 'Upgrade to {plan}',
    price: 'From <b>{price}</b> + tax per month, billed yearly. Everything you already have stays the same.',
    dismiss: 'Hide explanation',
  },
  kpi: {
    vsPrevious: 'Compared with the previous period',
  },
}

export default en
