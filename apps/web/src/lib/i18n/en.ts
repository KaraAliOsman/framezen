import type { Translation } from '@dekopen/shared'
import type es from './es'

const en: Translation<typeof es> = {
  api: {
    network: 'We could not connect. Your changes are safe; we will retry automatically.',
    server: 'Something went wrong on our side. Please try again in a moment.',
    status: {
      badRequest: 'Check the details and try again.',
      unauthorized: 'Your session has ended. Sign in again to continue.',
      forbidden: 'You do not have access to this. Ask the account owner to enable it for you.',
      notFound: 'We could not find what you are looking for. It may have been deleted or the link may be incomplete.',
      conflict: 'This was changed in another tab or by someone else. We loaded the latest version.',
      tooLarge: 'The file is too large. Try one under 1 MB.',
      tooMany: 'Too many requests in a row. Wait a few seconds and try again.',
    },
    code: {
      invalid_credentials: 'The email or password does not match. Check them or reset your password.',
      email_taken: 'That email already has an account. Sign in or reset your password.',
      too_many_attempts: 'Too many attempts in a row. Wait a few minutes and try again.',
      read_only: 'Your account is in read-only mode. Check your plan to keep editing.',
      plan_required: 'This is not included in your plan. You can upgrade in Settings › Plan.',
      seat_limit: 'You have reached your plan’s maximum number of people. Upgrade to add someone else.',
      revision_changed: 'The quote changed while you were reviewing it. Load the latest version.',
      invitation_expired: 'The invitation has expired. Ask the person who invited you for a new one.',
      invitation_used: 'This invitation has already been used. Sign in with your account.',
      invitation_revoked: 'This invitation was cancelled. Ask the person who invited you for a new one.',
      payment_provider: 'The payment provider did not respond. Please try again in a few minutes.',
    },
  },
}

export default en
