import type { Translation } from '@dekopen/shared'
import type es from './es'

const it: Translation<typeof es> = {
  api: {
    network: 'Non riusciamo a connetterci. Le tue modifiche sono al sicuro; riproviamo da soli.',
    server: 'Abbiamo avuto un problema da parte nostra. Riprova tra un momento.',
    status: {
      badRequest: 'Controlla i dati e riprova.',
      unauthorized: 'La tua sessione è scaduta. Accedi di nuovo per continuare.',
      forbidden: 'Non hai accesso a questo contenuto. Chiedi al titolare dell’account di abilitarlo.',
      notFound: 'Non troviamo quello che cerchi. Potrebbe essere stato eliminato o il link è incompleto.',
      conflict: 'È stato modificato in un’altra scheda o da un’altra persona. Abbiamo caricato la versione più recente.',
      tooLarge: 'Il file è troppo grande. Prova con uno inferiore a 1 MB.',
      tooMany: 'Troppe richieste di seguito. Aspetta qualche secondo e riprova.',
    },
    code: {
      invalid_credentials: 'L’email o la password non corrispondono. Controllale o reimposta la password.',
      email_taken: 'Questa email ha già un account. Accedi o reimposta la password.',
      too_many_attempts: 'Troppi tentativi di seguito. Attendi qualche minuto e riprova.',
      read_only: 'Il tuo account è in sola lettura. Controlla il tuo piano per continuare a modificare.',
      plan_required: 'Questa funzione non è inclusa nel tuo piano. Puoi aggiornarlo in Impostazioni › Piano.',
      seat_limit: 'Hai raggiunto il numero massimo di persone del tuo piano. Aggiornalo per aggiungere qualcun altro.',
      revision_changed: 'Il preventivo è cambiato mentre lo controllavi. Carica la versione più recente.',
      invitation_expired: 'L’invito è scaduto. Chiedine uno nuovo a chi ti ha invitato.',
      invitation_used: 'Questo invito è già stato usato. Accedi con il tuo account.',
      invitation_revoked: 'Questo invito è stato annullato. Chiedine uno nuovo a chi ti ha invitato.',
      payment_provider: 'Il sistema di pagamento non ha risposto. Riprova tra qualche minuto.',
    },
  },
}

export default it
