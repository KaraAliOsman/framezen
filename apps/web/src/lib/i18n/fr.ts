import type { Translation } from '@dekopen/shared'
import type es from './es'

const fr: Translation<typeof es> = {
  api: {
    network: 'Connexion impossible. Vos modifications sont en sécurité ; nous réessayons automatiquement.',
    server: 'Un problème est survenu de notre côté. Réessayez dans un instant.',
    status: {
      badRequest: 'Vérifiez les informations et réessayez.',
      unauthorized: 'Votre session a expiré. Reconnectez-vous pour continuer.',
      forbidden: 'Vous n’avez pas accès à cette page. Demandez au propriétaire du compte de vous l’ouvrir.',
      notFound: 'Nous ne trouvons pas ce que vous cherchez. Il a peut-être été supprimé ou le lien est incomplet.',
      conflict: 'Ceci a été modifié dans un autre onglet ou par une autre personne. Nous avons chargé la dernière version.',
      tooLarge: 'Le fichier est trop volumineux. Essayez avec un fichier de moins de 1 Mo.',
      tooMany: 'Trop de demandes d’affilée. Attendez quelques secondes et réessayez.',
    },
    code: {
      invalid_credentials: 'L’e-mail ou le mot de passe ne correspond pas. Vérifiez-les ou réinitialisez votre mot de passe.',
      email_taken: 'Cet e-mail a déjà un compte. Connectez-vous ou réinitialisez votre mot de passe.',
      too_many_attempts: 'Trop de tentatives d’affilée. Patientez quelques minutes et réessayez.',
      read_only: 'Votre compte est en lecture seule. Vérifiez votre abonnement pour continuer à modifier.',
      plan_required: 'Ceci n’est pas inclus dans votre abonnement. Vous pouvez le faire évoluer dans Réglages › Abonnement.',
      seat_limit: 'Vous avez atteint le nombre maximal de personnes de votre abonnement. Faites-le évoluer pour ajouter quelqu’un.',
      revision_changed: 'Le devis a changé pendant que vous le consultiez. Chargez la dernière version.',
      invitation_expired: 'L’invitation a expiré. Demandez-en une nouvelle à la personne qui vous a invité.',
      invitation_used: 'Cette invitation a déjà été utilisée. Connectez-vous avec votre compte.',
      invitation_revoked: 'Cette invitation a été annulée. Demandez-en une nouvelle à la personne qui vous a invité.',
      payment_provider: 'Le prestataire de paiement n’a pas répondu. Réessayez dans quelques minutes.',
    },
  },
}

export default fr
