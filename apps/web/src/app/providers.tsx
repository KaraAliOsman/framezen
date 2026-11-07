import type { ReactNode } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { I18nProvider } from '../lib/i18n/provider'
import { LocaleServerSync } from '../lib/i18n/sync'
import { queryClient as defaultClient } from '../lib/queryClient'
import { ThemeProvider } from '../lib/theme'
// Importes directos (no el índice de ui) para que la landing no descargue todo el kit.
import { Toaster } from '../ui/Toaster'
import { TooltipProvider } from '../ui/Tooltip'

/**
 * Proveedores globales: idioma (el más externo: landing, portal y avisos también lo usan), tema,
 * datos (con la sincronización del idioma guardado en la cuenta), movimiento (respeta «reducir
 * movimiento»), tooltips y avisos.
 */
export function AppProviders({ children, client = defaultClient }: { children: ReactNode; client?: QueryClient }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <LocaleServerSync />
          <MotionConfig reducedMotion="user">
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </MotionConfig>
        </QueryClientProvider>
      </ThemeProvider>
    </I18nProvider>
  )
}
