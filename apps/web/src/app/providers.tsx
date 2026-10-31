import type { ReactNode } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { queryClient as defaultClient } from '../lib/queryClient'
import { ThemeProvider } from '../lib/theme'
// Importes directos (no el índice de ui) para que la landing no descargue todo el kit.
import { Toaster } from '../ui/Toaster'
import { TooltipProvider } from '../ui/Tooltip'

/** Proveedores globales: tema, datos, movimiento (respeta «reducir movimiento»), tooltips y avisos. */
export function AppProviders({ children, client = defaultClient }: { children: ReactNode; client?: QueryClient }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <MotionConfig reducedMotion="user">
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </MotionConfig>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
