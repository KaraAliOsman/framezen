/** Textos del visor 3D (fuente en español). */
const es = {
  unavailable: {
    title: 'No pudimos mostrar la vista 3D',
    body: 'Este navegador no puede dibujar en 3D. El dibujo y la cotización se ven igual; para girar la ventana, prueba con Chrome, Edge o Safari actualizados.',
  },
  loading: 'Preparando la vista 3D…',
  hint: 'Arrastra para girar',
  open: 'Abrir',
  close: 'Cerrar',
  label: 'Ventana en 3D de {size}, vista {view}. Arrastra para girarla.',
  view: {
    interior: 'interior',
    exterior: 'exterior',
  },
  lost: {
    title: 'La vista 3D se pausó',
    body: 'El navegador liberó memoria gráfica. Tu ventana está intacta.',
    retry: 'Volver a mostrar',
  },
  ar: {
    button: 'Ver en tu espacio',
    preparing: 'Preparando…',
    qrTitle: 'Ábrelo en tu teléfono',
    qrBody: 'Escanea el código con la cámara y verás la ventana en tamaño real en tu casa, sin instalar nada.',
    copy: 'Copiar enlace',
    copied: 'Enlace copiado',
    browserTitle: 'Ábrelo en tu navegador',
    browserBody: 'Esta app no puede mostrar realidad aumentada. Copia el enlace y ábrelo en Safari o Chrome.',
    failedTitle: 'No se pudo abrir',
    failedBody: 'Este teléfono no pudo mostrar la ventana en tu espacio. La vista 3D sigue disponible aquí.',
    xrLoading: 'Preparando la ventana…',
    xrScan: 'Mueve el teléfono despacio y toca el piso o la pared.',
    xrPlaced: 'Toca otro punto para moverla.',
    xrClose: 'Salir',
    xrRotateLeft: 'Girar a la izquierda',
    xrRotateRight: 'Girar a la derecha',
  },
} as const

export default es
