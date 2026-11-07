import type { Translation } from '@dekopen/shared'
import type es from './es'

const it: Translation<typeof es> = {
  unavailable: {
    title: 'Impossibile mostrare la vista 3D',
    body: 'Questo browser non può disegnare in 3D. Il disegno e il preventivo si vedono uguale; per ruotare la finestra prova con Chrome, Edge o Safari aggiornati.',
  },
  loading: 'Preparazione della vista 3D…',
  hint: 'Trascina per ruotare',
  open: 'Apri',
  close: 'Chiudi',
  label: 'Finestra in 3D di {size}, vista {view}. Trascina per ruotarla.',
  view: {
    interior: 'interna',
    exterior: 'esterna',
  },
  lost: {
    title: 'La vista 3D è in pausa',
    body: 'Il browser ha liberato memoria grafica. La tua finestra è intatta.',
    retry: 'Mostra di nuovo',
  },
  ar: {
    button: 'Guarda nel tuo spazio',
    preparing: 'Preparazione…',
    qrTitle: 'Aprila sul telefono',
    qrBody: 'Inquadra il codice con la fotocamera e vedrai la finestra a grandezza reale a casa tua, senza installare nulla.',
    copy: 'Copia il link',
    copied: 'Link copiato',
    browserTitle: 'Aprila nel browser',
    browserBody: 'Questa app non può mostrare la realtà aumentata. Copia il link e aprilo in Safari o Chrome.',
    failedTitle: 'Impossibile aprirla',
    failedBody: 'Questo telefono non è riuscito a mostrare la finestra nel tuo spazio. La vista 3D resta disponibile qui.',
    xrLoading: 'Preparazione della finestra…',
    xrScan: 'Muovi lentamente il telefono e tocca il pavimento o la parete.',
    xrPlaced: 'Tocca un altro punto per spostarla.',
    xrClose: 'Esci',
    xrRotateLeft: 'Ruota a sinistra',
    xrRotateRight: 'Ruota a destra',
  },
}

export default it
