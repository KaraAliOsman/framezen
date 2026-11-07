/**
 * Textos de la cotización de ejemplo en el idioma de la página: nombre de cada ventana, ambiente y
 * color del catálogo de muestra. (En la app los nombres del catálogo de un taller no se traducen:
 * son sus datos. Aquí son ejemplos de marketing.)
 */
import { useMemo } from 'react'
import { useT } from '../../../lib/i18n'
import type { HeroTypology } from '../designer/designerModel'
import es from '../i18n/es'
import type { SampleItem } from './sampleQuote'

/** Colores del catálogo de ejemplo (`@dekopen/catalog`) → clave de traducción. */
const SAMPLE_COLOR_KEYS = {
  blanco: 'white',
  nogal: 'walnut',
  'roble-dorado': 'goldenOak',
  antracita: 'anthracite',
  negro: 'black',
} as const

type SampleColorId = keyof typeof SAMPLE_COLOR_KEYS

function isSampleColor(id: string | undefined): id is SampleColorId {
  return typeof id === 'string' && Object.hasOwn(SAMPLE_COLOR_KEYS, id)
}

export interface SampleText {
  /** Nombre de una tipología del mini diseñador («Corredera 2 hojas»). */
  typology: (id: HeroTypology) => string
  /** Nombre de una ventana de la cotización de ejemplo. */
  item: (item: Pick<SampleItem, 'typology'>) => string
  /** Ambiente de la ventana («Living»). */
  room: (item: Pick<SampleItem, 'room'>) => string
  /** Color del catálogo de ejemplo por id; si no es de la muestra, el nombre tal cual. */
  color: (id: string | undefined, fallback?: string) => string
}

export function useSampleText(): SampleText {
  const t = useT(es)
  return useMemo<SampleText>(
    () => ({
      typology: (id) => t(`designer.titles.${id}`),
      item: (item) => t(`designer.titles.${item.typology}`),
      room: (item) => t(`sample.rooms.${item.room}`),
      color: (id, fallback = '') => (isSampleColor(id) ? t(`sample.colors.${SAMPLE_COLOR_KEYS[id]}`) : fallback),
    }),
    [t],
  )
}
