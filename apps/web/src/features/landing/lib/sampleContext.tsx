import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useT } from '../../../lib/i18n'
import es from '../i18n/es'
import { buildSampleQuote, type SampleQuote } from './sampleDoc'

const SampleQuoteContext = createContext<SampleQuote | null>(null)

/** Una sola cotización de ejemplo para toda la página, en su idioma. */
export function SampleQuoteProvider({ children }: { children: ReactNode }) {
  const t = useT(es)
  const value = useMemo(
    () =>
      buildSampleQuote({
        shop: t('sample.shop'),
        job: t('sample.job'),
        client: t('sample.client'),
        install: t('sample.install'),
        rooms: [t('sample.rooms.living'), t('sample.rooms.kitchen'), t('sample.rooms.bedroom'), t('sample.rooms.bathrooms'), t('sample.rooms.entrance')],
      }),
    [t],
  )
  return <SampleQuoteContext.Provider value={value}>{children}</SampleQuoteContext.Provider>
}

export function useSampleQuote(): SampleQuote | null {
  return useContext(SampleQuoteContext)
}
