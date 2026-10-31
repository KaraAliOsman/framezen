import { useState } from 'react'
import { RouterProvider } from 'react-router'
import { AppProviders } from './providers'
import { createAppRouter } from './router'

export function App() {
  // Un router por montaje (evita compartir estado entre pruebas o recargas en caliente).
  const [router] = useState(createAppRouter)
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
