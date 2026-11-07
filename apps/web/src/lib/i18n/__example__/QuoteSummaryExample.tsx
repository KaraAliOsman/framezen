/**
 * Ejemplo de referencia para la ola 1 (no se usa en la app): un componente con su espacio de nombres,
 * plural, texto enriquecido, dinero/medidas del idioma, glosario y una etiqueta de deshacer por clave.
 */
import { useFormat } from '../format'
import { useGlossary } from '../glossary'
import { T, useT } from '../provider'
import { translate } from '../runtime'
import es from './i18n/es'

export interface QuoteSummaryExampleProps {
  number: number
  windows: number
  total: number
  typology: string
  width: number
  height: number
}

/** Etiqueta de deshacer fuera de React: se guarda la **clave** (estable) y se traduce al mostrar. */
export function resizeUndoLabel(width: number, height: number): { key: 'undo.resize'; label: string } {
  // La clave sirve para agrupar pasos en el historial; el texto puede cambiar de idioma.
  return { key: 'undo.resize', label: translate(es, 'undo.resize', { size: `${width} × ${height} mm` }) }
}

export function QuoteSummaryExample({ number, windows, total, typology, width, height }: QuoteSummaryExampleProps) {
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  return (
    <section aria-label={t('title', { number: fmt.docNumber(number) })}>
      <h2>{t('title', { number: fmt.docNumber(number) })}</h2>
      <p data-testid="windows">{t('windows', { count: windows })}</p>
      <p data-testid="typology">
        {g.typology(typology)} · {fmt.size(width, height)}
      </p>
      <p data-testid="total">
        <T ns={es} k="total" values={{ b: <strong />, total: fmt.money(total) }} />
      </p>
      <p data-testid="help">{t.rich('help', { link: (chunks) => <a href="/ayuda/medidas">{chunks}</a> })}</p>
    </section>
  )
}
