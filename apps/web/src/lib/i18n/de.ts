import type { Translation } from '@dekopen/shared'
import type es from './es'

const de: Translation<typeof es> = {
  api: {
    network: 'Keine Verbindung möglich. Ihre Änderungen sind sicher; wir versuchen es automatisch erneut.',
    server: 'Bei uns ist ein Problem aufgetreten. Bitte versuchen Sie es gleich noch einmal.',
    status: {
      badRequest: 'Prüfen Sie die Angaben und versuchen Sie es erneut.',
      unauthorized: 'Ihre Sitzung ist abgelaufen. Melden Sie sich erneut an, um fortzufahren.',
      forbidden: 'Sie haben keinen Zugriff darauf. Bitten Sie den Kontoinhaber, ihn freizugeben.',
      notFound: 'Wir finden nicht, was Sie suchen. Es wurde vielleicht gelöscht oder der Link ist unvollständig.',
      conflict: 'Dies wurde in einem anderen Tab oder von einer anderen Person geändert. Wir haben die neueste Version geladen.',
      tooLarge: 'Die Datei ist zu groß. Versuchen Sie es mit einer Datei unter 1 MB.',
      tooMany: 'Zu viele Anfragen hintereinander. Warten Sie einige Sekunden und versuchen Sie es erneut.',
    },
    code: {
      invalid_credentials: 'E-Mail oder Passwort stimmen nicht. Prüfen Sie die Angaben oder setzen Sie Ihr Passwort zurück.',
      email_taken: 'Für diese E-Mail gibt es bereits ein Konto. Melden Sie sich an oder setzen Sie Ihr Passwort zurück.',
      too_many_attempts: 'Zu viele Versuche hintereinander. Warten Sie einige Minuten und versuchen Sie es erneut.',
      read_only: 'Ihr Konto ist schreibgeschützt. Prüfen Sie Ihren Tarif, um weiter zu bearbeiten.',
      plan_required: 'Das ist in Ihrem Tarif nicht enthalten. Sie können ihn unter Einstellungen › Tarif erweitern.',
      seat_limit: 'Sie haben die maximale Personenzahl Ihres Tarifs erreicht. Erweitern Sie ihn, um weitere Personen hinzuzufügen.',
      revision_changed: 'Das Angebot hat sich geändert, während Sie es geprüft haben. Laden Sie die neueste Version.',
      invitation_expired: 'Die Einladung ist abgelaufen. Bitten Sie die einladende Person um eine neue.',
      invitation_used: 'Diese Einladung wurde bereits verwendet. Melden Sie sich mit Ihrem Konto an.',
      invitation_revoked: 'Diese Einladung wurde zurückgezogen. Bitten Sie die einladende Person um eine neue.',
      payment_provider: 'Der Zahlungsanbieter hat nicht geantwortet. Bitte versuchen Sie es in einigen Minuten erneut.',
    },
  },
}

export default de
