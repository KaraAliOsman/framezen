/**
 * Textos del kit de componentes (`apps/web/src/ui`). Español de Chile, copiado byte a byte del
 * código anterior (las pruebas buscan estos textos). Guía: docs/build/i18n-guia.md.
 */
const es = {
  common: {
    close: 'Cerrar',
    optional: '(opcional)',
    loading: 'Cargando',
    retry: 'Reintentar',
    undo: 'Deshacer',
    selectPlaceholder: 'Elige una opción',
    breadcrumbs: 'Ruta',
    toasts: 'Avisos',
  },
  keys: {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    delete: 'Supr',
    space: 'Espacio',
    escape: 'Esc',
    enter: 'Enter',
  },
  combobox: {
    create: 'Crear <b>«{query}»</b>',
    placeholder: 'Elige o escribe…',
    search: 'Buscar…',
    empty: 'Sin coincidencias.',
    clear: 'Quitar selección',
  },
  palette: {
    title: 'Buscar y comandos',
    placeholder: 'Busca o escribe un comando…',
    noMatchesFor: 'Sin coincidencias para «{query}».',
    nothing: 'Nada por aquí. Prueba con otra palabra.',
    askHeading: 'Asistente',
    ask: 'Preguntarle a {name}: <b>«{query}»</b>',
    askGeneric: 'Preguntarle al asistente: <b>«{query}»</b>',
    open: 'abrir',
    move: 'moverte',
    toggle: 'abrir y cerrar',
  },
  table: {
    selectAll: 'Seleccionar todas',
    selectRow: 'Seleccionar fila',
    edit: 'Editar {column}',
    editGeneric: 'Editar',
    noResultsFor: 'Sin resultados para «{query}».',
    noneWithFilters: 'No hay {noun} con estos filtros.',
    nothingWithFilters: 'No hay nada con estos filtros.',
    clearFilters: 'Quitar filtros',
    rows: '{count, plural, one {# fila} other {# filas}}',
    /** `items` ya trae número y sustantivo («3 clientes»): sin concordancia de género. */
    selectedCount: '{items} en la selección',
    hiddenByFilters: 'Los filtros ocultan {items}',
    bulkActions: 'Acciones con la selección',
    clearSelection: 'Quitar selección',
  },
  error: {
    title: 'No pudimos mostrar esta parte',
    description: 'Tus datos están a salvo. Reintenta en un momento.',
  },
  save: {
    saving: 'Guardando…',
    saved: 'Guardado',
    savedAt: 'Guardado {when}',
    offline: 'Sin conexión · tus cambios están a salvo',
    error: 'No pudimos guardar · reintentamos solos',
  },
  plan: {
    available: '{feature}: disponible en {plan}',
    badge: 'Plan {plan}',
    see: 'Ver plan {plan}',
    upgrade: 'Mejorar a {plan}',
    price: 'Desde <b>{price}</b> + IVA al mes pagando anual. Todo lo que ya tienes sigue igual.',
    dismiss: 'Ocultar explicación',
  },
  kpi: {
    vsPrevious: 'Frente al período anterior',
  },
} as const

export default es
