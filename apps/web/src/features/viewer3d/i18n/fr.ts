import type { Translation } from '@dekopen/shared'
import type es from './es'

const fr: Translation<typeof es> = {
  unavailable: {
    title: "Impossible d'afficher la vue 3D",
    body: "Ce navigateur ne peut pas dessiner en 3D. Le dessin et le devis s'affichent normalement ; pour faire pivoter la fenêtre, utilisez une version à jour de Chrome, Edge ou Safari.",
  },
  loading: 'Préparation de la vue 3D…',
  hint: 'Faites glisser pour pivoter',
  open: 'Ouvrir',
  close: 'Fermer',
  label: 'Fenêtre en 3D de {size}, vue {view}. Faites glisser pour la faire pivoter.',
  view: {
    interior: 'intérieure',
    exterior: 'extérieure',
  },
  lost: {
    title: 'La vue 3D a été mise en pause',
    body: 'Le navigateur a libéré de la mémoire graphique. Votre fenêtre est intacte.',
    retry: 'Afficher à nouveau',
  },
  ar: {
    button: 'Voir chez vous',
    preparing: 'Préparation…',
    qrTitle: 'Ouvrez-la sur votre téléphone',
    qrBody: 'Scannez le code avec l’appareil photo pour voir la fenêtre en taille réelle chez vous, sans rien installer.',
    copy: 'Copier le lien',
    copied: 'Lien copié',
    browserTitle: 'Ouvrez-la dans votre navigateur',
    browserBody: 'Cette application ne peut pas afficher la réalité augmentée. Copiez le lien et ouvrez-le dans Safari ou Chrome.',
    failedTitle: 'Ouverture impossible',
    failedBody: 'Ce téléphone n’a pas pu afficher la fenêtre chez vous. La vue 3D reste disponible ici.',
    xrLoading: 'Préparation de la fenêtre…',
    xrScan: 'Déplacez lentement le téléphone et touchez le sol ou le mur.',
    xrPlaced: 'Touchez un autre point pour la déplacer.',
    xrClose: 'Quitter',
    xrRotateLeft: 'Tourner à gauche',
    xrRotateRight: 'Tourner à droite',
  },
}

export default fr
