/**
 * Lo que falta antes de enviar, sobre el documento mismo. No bloquea: un compromiso que el taller no
 * escribió simplemente no se imprime, y aquí se dice cuál para que no pase inadvertido.
 */
import { useMemo } from 'react'
import { buildQuoteModel, quoteDocChecks, type DocCheck, type QuoteDocData } from '@dekopen/documents'
import type { DocTemplate } from '@dekopen/shared'
import { useT } from '../../../lib/i18n'
import { Notice } from '../../../ui'
import es from '../i18n/es'

export function useDocChecks(data: QuoteDocData | null | undefined, template: string | DocTemplate | undefined): DocCheck[] {
  return useMemo(() => (data ? quoteDocChecks(buildQuoteModel(data, { template: template ?? null })) : []), [data, template])
}

export function DocChecks({ checks, onFix, className }: { checks: readonly DocCheck[]; onFix?: () => void; className?: string }) {
  const t = useT(es)
  if (checks.length === 0) return null
  const commitments = checks.filter((c) => c.code !== 'brand_logo' && c.code !== 'hardware_logo' && c.code !== 'pending_price' && c.code !== 'blank').map((c) => t(`checks.${c.code as 'validity'}`))
  const pending = checks.find((c) => c.code === 'pending_price')
  const blank = checks.filter((c) => c.code === 'blank').map((c) => t(`texts.${c.field ?? 'warranty'}`))
  const brands = checks.filter((c) => c.code === 'brand_logo').map((c) => c.brand ?? '')
  const hardware = checks.some((c) => c.code === 'hardware_logo')
  return (
    <div className={className} data-doc-checks>
      <Notice tone="warning" size="compact" title={t('checks.title')}>
        <ul className="flex flex-col gap-0.5">
          {pending ? <li className="font-medium">{t('checks.pending', { count: pending.count ?? 1 })}</li> : null}
          {commitments.length ? <li>{t('checks.commitments', { list: commitments.join(', ') })}</li> : null}
          {blank.length ? <li>{t('checks.blank', { list: blank.join(', ') })}</li> : null}
          {brands.length ? <li>{t('checks.brands', { list: brands.join(', ') })}</li> : null}
          {hardware ? <li>{t('checks.hardware')}</li> : null}
        </ul>
        {onFix ? (
          <button type="button" onClick={onFix} className="mt-1 text-table font-medium text-accent-ink hover:underline">
            {t('checks.fix')}
          </button>
        ) : null}
      </Notice>
    </div>
  )
}
