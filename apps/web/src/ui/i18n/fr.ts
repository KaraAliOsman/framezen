import type { Translation } from '@dekopen/shared'
import type es from './es'

const fr: Translation<typeof es> = {
  common: {
    close: 'Fermer',
    optional: '(facultatif)',
    loading: 'Chargement',
    retry: 'Réessayer',
    undo: 'Annuler',
    selectPlaceholder: 'Choisissez une option',
    breadcrumbs: 'Fil d’Ariane',
    toasts: 'Notifications',
  },
  keys: {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Maj',
    delete: 'Suppr',
    space: 'Espace',
    escape: 'Échap',
    enter: 'Entrée',
  },
  combobox: {
    create: 'Créer <b>« {query} »</b>',
    placeholder: 'Choisissez ou saisissez…',
    search: 'Rechercher…',
    empty: 'Aucun résultat.',
    clear: 'Effacer la sélection',
  },
  palette: {
    title: 'Recherche et commandes',
    placeholder: 'Recherchez ou saisissez une commande…',
    noMatchesFor: 'Aucun résultat pour « {query} ».',
    nothing: 'Rien ici. Essayez un autre mot.',
    askHeading: 'Assistant',
    ask: 'Demander à {name} : <b>« {query} »</b>',
    askGeneric: 'Demander à l’assistant : <b>« {query} »</b>',
    open: 'ouvrir',
    move: 'se déplacer',
    toggle: 'ouvrir et fermer',
  },
  table: {
    selectAll: 'Tout sélectionner',
    selectRow: 'Sélectionner la ligne',
    edit: 'Modifier {column}',
    editGeneric: 'Modifier',
    noResultsFor: 'Aucun résultat pour « {query} ».',
    noneWithFilters: 'Aucun résultat ({noun}) pour ces filtres.',
    nothingWithFilters: 'Rien ne correspond à ces filtres.',
    clearFilters: 'Effacer les filtres',
    rows: '{count, plural, one {# ligne} other {# lignes}}',
    selectedCount: 'Sélection : {items}',
    hiddenByFilters: 'Les filtres masquent {items}',
    bulkActions: 'Actions sur la sélection',
    clearSelection: 'Effacer la sélection',
  },
  error: {
    title: 'Nous n’avons pas pu afficher cette partie',
    description: 'Vos données sont en sécurité. Réessayez dans un instant.',
  },
  save: {
    saving: 'Enregistrement…',
    saved: 'Enregistré',
    savedAt: 'Enregistré {when}',
    offline: 'Hors ligne · vos modifications sont en sécurité',
    error: 'Enregistrement impossible · nouvel essai automatique',
  },
  plan: {
    available: '{feature} : disponible avec {plan}',
    badge: 'Offre {plan}',
    see: 'Voir l’offre {plan}',
    upgrade: 'Passer à {plan}',
    price: 'À partir de <b>{price}</b> HT par mois en paiement annuel. Tout ce que vous avez déjà reste identique.',
    dismiss: 'Masquer l’explication',
  },
  kpi: {
    vsPrevious: 'Par rapport à la période précédente',
  },
}

export default fr
