/**
 * Arnés local para revisar el diseñador sin tocar el router (mientras se registra /dev/designer).
 * Se abre en http://localhost:5180/src/features/designer/dev/playground.html
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from '../../../app/providers'
import DesignerPlayground from '../DesignerPlayground'
import '../../../styles.css'

const params = new URLSearchParams(window.location.search)
if (params.get('theme')) localStorage.setItem('fz-theme', params.get('theme') === 'dark' ? 'dark' : 'light')
document.documentElement.dataset.theme = localStorage.getItem('fz-theme') === 'dark' ? 'dark' : 'light'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <DesignerPlayground />
    </AppProviders>
  </StrictMode>,
)
