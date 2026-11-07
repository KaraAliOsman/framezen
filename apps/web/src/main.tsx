import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles.css'
import { restoreZoom } from './lib/zoom'

restoreZoom()

// Pestañas y segmentados enfocan por script al hacer clic y el navegador los marca como foco de teclado:
// se distingue el puntero del teclado para que el anillo aparezca solo cuando sirve (ver styles.css).
const root = document.documentElement
addEventListener('pointerdown', () => (root.dataset.input = 'pointer'), true)
addEventListener('keydown', (e) => {
  if (e.key === 'Tab' || e.key.startsWith('Arrow')) delete root.dataset.input
}, true)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
