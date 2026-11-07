import type { Translation } from '@dekopen/shared'
import type es from './es'

const pt: Translation<typeof es> = {
  common: {
    close: 'Fechar',
    optional: '(opcional)',
    loading: 'Carregando',
    retry: 'Tentar de novo',
    undo: 'Desfazer',
    selectPlaceholder: 'Escolha uma opção',
    breadcrumbs: 'Caminho',
    toasts: 'Avisos',
  },
  keys: {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    delete: 'Del',
    space: 'Espaço',
    escape: 'Esc',
    enter: 'Enter',
  },
  combobox: {
    create: 'Criar <b>“{query}”</b>',
    placeholder: 'Escolha ou digite…',
    search: 'Buscar…',
    empty: 'Nenhum resultado.',
    clear: 'Limpar seleção',
  },
  palette: {
    title: 'Busca e comandos',
    placeholder: 'Busque ou digite um comando…',
    noMatchesFor: 'Nenhum resultado para “{query}”.',
    nothing: 'Nada por aqui. Tente outra palavra.',
    askHeading: 'Assistente',
    ask: 'Perguntar a {name}: <b>“{query}”</b>',
    askGeneric: 'Perguntar ao assistente: <b>“{query}”</b>',
    open: 'abrir',
    move: 'navegar',
    toggle: 'abrir e fechar',
  },
  table: {
    selectAll: 'Selecionar todas',
    selectRow: 'Selecionar linha',
    edit: 'Editar {column}',
    editGeneric: 'Editar',
    noResultsFor: 'Nenhum resultado para “{query}”.',
    noneWithFilters: 'Não há {noun} com estes filtros.',
    nothingWithFilters: 'Nada corresponde a estes filtros.',
    clearFilters: 'Limpar filtros',
    rows: '{count, plural, one {# linha} other {# linhas}}',
    selectedCount: '{items} na seleção',
    hiddenByFilters: 'Os filtros ocultam {items}',
    bulkActions: 'Ações com a seleção',
    clearSelection: 'Limpar seleção',
  },
  error: {
    title: 'Não conseguimos mostrar esta parte',
    description: 'Seus dados estão seguros. Tente de novo em instantes.',
  },
  save: {
    saving: 'Salvando…',
    saved: 'Salvo',
    savedAt: 'Salvo {when}',
    offline: 'Sem conexão · suas alterações estão seguras',
    error: 'Não foi possível salvar · tentaremos de novo automaticamente',
  },
  plan: {
    available: '{feature}: disponível no {plan}',
    badge: 'Plano {plan}',
    see: 'Ver plano {plan}',
    upgrade: 'Mudar para {plan}',
    price: 'A partir de <b>{price}</b> + impostos por mês no plano anual. Tudo o que você já tem continua igual.',
    dismiss: 'Ocultar explicação',
  },
  kpi: {
    vsPrevious: 'Em relação ao período anterior',
  },
}

export default pt
