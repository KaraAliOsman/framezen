import type { Translation } from '@dekopen/shared'
import type es from './es'

const de: Translation<typeof es> = {
  unavailable: {
    title: 'Die 3D-Ansicht kann nicht angezeigt werden',
    body: 'Dieser Browser kann nicht in 3D zeichnen. Zeichnung und Angebot werden unverändert angezeigt; zum Drehen des Fensters verwenden Sie ein aktuelles Chrome, Edge oder Safari.',
  },
  loading: '3D-Ansicht wird vorbereitet…',
  hint: 'Zum Drehen ziehen',
  open: 'Öffnen',
  close: 'Schließen',
  label: 'Fenster in 3D, {size}, {view}. Zum Drehen ziehen.',
  view: {
    interior: 'Innenansicht',
    exterior: 'Außenansicht',
  },
  lost: {
    title: 'Die 3D-Ansicht wurde pausiert',
    body: 'Der Browser hat Grafikspeicher freigegeben. Ihr Fenster ist unverändert.',
    retry: 'Erneut anzeigen',
  },
  ar: {
    button: 'In Ihrem Raum ansehen',
    preparing: 'Wird vorbereitet…',
    qrTitle: 'Auf dem Handy öffnen',
    qrBody: 'Scannen Sie den Code mit der Kamera und sehen Sie das Fenster in Originalgröße bei Ihnen zu Hause, ohne Installation.',
    copy: 'Link kopieren',
    copied: 'Link kopiert',
    browserTitle: 'Im Browser öffnen',
    browserBody: 'Diese App kann keine Augmented Reality anzeigen. Kopieren Sie den Link und öffnen Sie ihn in Safari oder Chrome.',
    failedTitle: 'Konnte nicht geöffnet werden',
    failedBody: 'Dieses Handy konnte das Fenster nicht in Ihrem Raum anzeigen. Die 3D-Ansicht steht hier weiter zur Verfügung.',
    xrLoading: 'Fenster wird vorbereitet…',
    xrScan: 'Bewegen Sie das Handy langsam und tippen Sie auf Boden oder Wand.',
    xrPlaced: 'Tippen Sie auf eine andere Stelle, um es zu verschieben.',
    xrClose: 'Beenden',
    xrRotateLeft: 'Nach links drehen',
    xrRotateRight: 'Nach rechts drehen',
  },
}

export default de
