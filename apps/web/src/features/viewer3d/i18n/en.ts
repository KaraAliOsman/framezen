import type { Translation } from '@dekopen/shared'
import type es from './es'

const en: Translation<typeof es> = {
  unavailable: {
    title: "We couldn't show the 3D view",
    body: "This browser can't draw in 3D. The drawing and the quote look the same; to rotate the window, try an up-to-date Chrome, Edge or Safari.",
  },
  loading: 'Preparing the 3D view…',
  hint: 'Drag to rotate',
  open: 'Open',
  close: 'Close',
  label: '3D window of {size}, {view} view. Drag to rotate it.',
  view: {
    interior: 'interior',
    exterior: 'exterior',
  },
  lost: {
    title: 'The 3D view was paused',
    body: 'The browser freed graphics memory. Your window is intact.',
    retry: 'Show again',
  },
  ar: {
    button: 'View in your space',
    preparing: 'Preparing…',
    qrTitle: 'Open it on your phone',
    qrBody: 'Scan the code with your camera to see the window at full size in your home. Nothing to install.',
    copy: 'Copy link',
    copied: 'Link copied',
    browserTitle: 'Open it in your browser',
    browserBody: 'This app can’t show augmented reality. Copy the link and open it in Safari or Chrome.',
    failedTitle: 'Couldn’t open it',
    failedBody: 'This phone couldn’t show the window in your space. The 3D view is still available here.',
    xrLoading: 'Preparing the window…',
    xrScan: 'Move your phone slowly and tap the floor or the wall.',
    xrPlaced: 'Tap another spot to move it.',
    xrClose: 'Exit',
    xrRotateLeft: 'Rotate left',
    xrRotateRight: 'Rotate right',
  },
}

export default en
