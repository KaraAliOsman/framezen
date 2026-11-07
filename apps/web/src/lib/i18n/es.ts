/**
 * Espacio de nombres `lib` (fuente en español): textos de `lib/api.ts` (errores de red y de la API).
 * Los textos que ya existían están copiados byte a byte (las pruebas los comparan).
 */
const es = {
  api: {
    network: 'No pudimos conectar. Tus cambios están a salvo; reintentamos solos.',
    server: 'Tuvimos un problema de nuestro lado. Inténtalo de nuevo en un momento.',
    status: {
      badRequest: 'Revisa los datos e inténtalo de nuevo.',
      unauthorized: 'Tu sesión terminó. Vuelve a entrar para seguir.',
      forbidden: 'No tienes acceso a esto. Pídele al dueño de la cuenta que te lo habilite.',
      notFound: 'No encontramos lo que buscas. Puede que se haya borrado o que el enlace esté incompleto.',
      conflict: 'Esto cambió en otra pestaña o por otra persona. Cargamos la versión más reciente.',
      tooLarge: 'El archivo es demasiado grande. Prueba con uno de menos de 1 MB.',
      tooMany: 'Demasiadas solicitudes seguidas. Espera unos segundos y vuelve a intentarlo.',
    },
    /** Por `code` estable del servidor, cuando su mensaje no viene en el idioma de la interfaz. */
    code: {
      invalid_credentials: 'El correo o la contraseña no coinciden. Revísalos o recupera tu contraseña.',
      email_taken: 'Ese correo ya tiene una cuenta. Entra o recupera tu contraseña.',
      too_many_attempts: 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.',
      read_only: 'Tu cuenta está en modo de solo lectura. Revisa tu plan para seguir editando.',
      plan_required: 'Esto no está incluido en tu plan. Puedes mejorarlo en Ajustes › Plan.',
      seat_limit: 'Llegaste al máximo de personas de tu plan. Mejóralo para sumar a alguien más.',
      revision_changed: 'La cotización cambió mientras la revisabas. Carga la versión más reciente.',
      invitation_expired: 'La invitación venció. Pide una nueva a quien te invitó.',
      invitation_used: 'Esta invitación ya se usó. Entra con tu cuenta.',
      invitation_revoked: 'Esta invitación fue anulada. Pide una nueva a quien te invitó.',
      payment_provider: 'El medio de pago no respondió. Inténtalo de nuevo en unos minutos.',
    },
  },
} as const

export default es
