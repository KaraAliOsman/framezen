import type { Translation } from '@dekopen/shared'
import type es from './es'

const tr: Translation<typeof es> = {
  api: {
    network: 'Bağlanamadık. Değişiklikleriniz güvende; otomatik olarak yeniden deniyoruz.',
    server: 'Bizim tarafımızda bir sorun oluştu. Lütfen birazdan tekrar deneyin.',
    status: {
      badRequest: 'Bilgileri kontrol edip tekrar deneyin.',
      unauthorized: 'Oturumunuz sona erdi. Devam etmek için yeniden giriş yapın.',
      forbidden: 'Buna erişiminiz yok. Hesap sahibinden erişim açmasını isteyin.',
      notFound: 'Aradığınızı bulamadık. Silinmiş olabilir veya bağlantı eksik olabilir.',
      conflict: 'Bu, başka bir sekmede veya başka biri tarafından değiştirildi. En son sürümü yükledik.',
      tooLarge: 'Dosya çok büyük. 1 MB’tan küçük bir dosya deneyin.',
      tooMany: 'Art arda çok fazla istek. Birkaç saniye bekleyip yeniden deneyin.',
    },
    code: {
      invalid_credentials: 'E-posta veya şifre eşleşmiyor. Kontrol edin ya da şifrenizi sıfırlayın.',
      email_taken: 'Bu e-postayla zaten bir hesap var. Giriş yapın veya şifrenizi sıfırlayın.',
      too_many_attempts: 'Arka arkaya çok fazla deneme yapıldı. Birkaç dakika bekleyip tekrar deneyin.',
      read_only: 'Hesabınız salt okunur modda. Düzenlemeye devam etmek için planınızı kontrol edin.',
      plan_required: 'Bu özellik planınıza dahil değil. Ayarlar › Plan bölümünden planınızı yükseltebilirsiniz.',
      seat_limit: 'Planınızdaki en fazla kişi sayısına ulaştınız. Başka birini eklemek için planınızı yükseltin.',
      revision_changed: 'Siz incelerken teklif değişti. En son sürümü yükleyin.',
      invitation_expired: 'Davetin süresi doldu. Sizi davet eden kişiden yeni bir davet isteyin.',
      invitation_used: 'Bu davet zaten kullanıldı. Hesabınızla giriş yapın.',
      invitation_revoked: 'Bu davet iptal edildi. Sizi davet eden kişiden yeni bir davet isteyin.',
      payment_provider: 'Ödeme sağlayıcısı yanıt vermedi. Birkaç dakika sonra tekrar deneyin.',
    },
  },
}

export default tr
