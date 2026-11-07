import type { Translation } from '@dekopen/shared'
import type es from './es'

const tr: Translation<typeof es> = {
  unavailable: {
    title: '3B görünüm gösterilemedi',
    body: 'Bu tarayıcı 3B çizim yapamıyor. Çizim ve teklif aynı şekilde görünür; pencereyi döndürmek için güncel bir Chrome, Edge veya Safari deneyin.',
  },
  loading: '3B görünüm hazırlanıyor…',
  hint: 'Döndürmek için sürükleyin',
  open: 'Aç',
  close: 'Kapat',
  label: '{size} 3B pencere, {view} görünüm. Döndürmek için sürükleyin.',
  view: {
    interior: 'iç',
    exterior: 'dış',
  },
  lost: {
    title: '3B görünüm duraklatıldı',
    body: 'Tarayıcı grafik belleğini boşalttı. Pencereniz olduğu gibi duruyor.',
    retry: 'Yeniden göster',
  },
  ar: {
    button: 'Mekânında gör',
    preparing: 'Hazırlanıyor…',
    qrTitle: 'Telefonunda aç',
    qrBody: 'Kodu kamerayla tara; hiçbir şey yüklemeden pencereyi evinde gerçek boyutta gör.',
    copy: 'Bağlantıyı kopyala',
    copied: 'Bağlantı kopyalandı',
    browserTitle: 'Tarayıcıda aç',
    browserBody: 'Bu uygulama artırılmış gerçeklik gösteremiyor. Bağlantıyı kopyalayıp Safari veya Chrome’da aç.',
    failedTitle: 'Açılamadı',
    failedBody: 'Bu telefon pencereyi mekânında gösteremedi. 3D görünüm burada kullanılabilir.',
    xrLoading: 'Pencere hazırlanıyor…',
    xrScan: 'Telefonu yavaşça hareket ettir, zemine veya duvara dokun.',
    xrPlaced: 'Taşımak için başka bir noktaya dokun.',
    xrClose: 'Çık',
    xrRotateLeft: 'Sola döndür',
    xrRotateRight: 'Sağa döndür',
  },
}

export default tr
