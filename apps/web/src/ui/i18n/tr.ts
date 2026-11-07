import type { Translation } from '@dekopen/shared'
import type es from './es'

const tr: Translation<typeof es> = {
  common: {
    close: 'Kapat',
    optional: '(isteğe bağlı)',
    loading: 'Yükleniyor',
    retry: 'Tekrar dene',
    undo: 'Geri al',
    selectPlaceholder: 'Bir seçenek belirleyin',
    breadcrumbs: 'Konum',
    toasts: 'Bildirimler',
  },
  keys: {
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: 'Shift',
    delete: 'Del',
    space: 'Boşluk',
    escape: 'Esc',
    enter: 'Enter',
  },
  combobox: {
    create: '<b>“{query}”</b> oluştur',
    placeholder: 'Seçin veya yazın…',
    search: 'Ara…',
    empty: 'Eşleşme yok.',
    clear: 'Seçimi kaldır',
  },
  palette: {
    title: 'Arama ve komutlar',
    placeholder: 'Arayın veya bir komut yazın…',
    noMatchesFor: '“{query}” için eşleşme yok.',
    nothing: 'Burada bir şey yok. Başka bir kelime deneyin.',
    askHeading: 'Asistan',
    ask: 'Sorun ({name}): <b>“{query}”</b>',
    askGeneric: 'Asistana sorun: <b>“{query}”</b>',
    open: 'aç',
    move: 'gezin',
    toggle: 'aç ve kapat',
  },
  table: {
    selectAll: 'Tümünü seç',
    selectRow: 'Satırı seç',
    edit: 'Düzenle: {column}',
    editGeneric: 'Düzenle',
    noResultsFor: '“{query}” için sonuç yok.',
    noneWithFilters: 'Bu filtrelere uyan kayıt yok ({noun}).',
    nothingWithFilters: 'Bu filtrelere uyan bir şey yok.',
    clearFilters: 'Filtreleri temizle',
    rows: '{count, plural, one {# satır} other {# satır}}',
    selectedCount: 'Seçili: {items}',
    hiddenByFilters: 'Filtrelerle gizlenen: {items}',
    bulkActions: 'Seçimle yapılacak işlemler',
    clearSelection: 'Seçimi kaldır',
  },
  error: {
    title: 'Bu bölümü gösteremedik',
    description: 'Verileriniz güvende. Birazdan yeniden deneyin.',
  },
  save: {
    saving: 'Kaydediliyor…',
    saved: 'Kaydedildi',
    savedAt: 'Kaydedildi: {when}',
    offline: 'Bağlantı yok · değişiklikleriniz güvende',
    error: 'Kaydedilemedi · otomatik olarak yeniden deniyoruz',
  },
  plan: {
    available: '{feature}: {plan} paketinde mevcut',
    badge: 'Paket: {plan}',
    see: 'Paketi görün: {plan}',
    upgrade: 'Yükseltin: {plan}',
    price: 'Yıllık ödemede aylık <b>{price}</b> + KDV’den başlayan fiyatlarla. Sahip olduğunuz her şey aynen kalır.',
    dismiss: 'Açıklamayı gizle',
  },
  kpi: {
    vsPrevious: 'Önceki döneme göre',
  },
}

export default tr
