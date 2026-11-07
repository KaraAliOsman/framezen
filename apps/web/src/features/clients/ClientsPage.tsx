/**
 * Clientes: lista a sangre de dos líneas, con cotizaciones y total aceptado a la derecha. Busca por
 * nombre, RUT, teléfono o ciudad, sin tildes. «?nuevo=1» abre la hoja de cliente nuevo; «?importar=1»,
 * la de importar desde una planilla.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Search, Upload, UserPlus, Users } from 'lucide-react'
import type { Client } from '@dekopen/shared'
import { humanError } from '../../lib/api'
import { useFormat, useT } from '../../lib/i18n'
import { usePageTitle } from '../../lib/usePageTitle'
import { useShortcut } from '../../lib/useShortcut'
import { Button, DataTable, EmptyState, Input, Numeric, Page, PageHeader, RowTitle, SkeletonRows, type DataTableColumn } from '../../ui'
import { useClientList, useDebouncedValue } from './api'
import es from './i18n/es'
import { ImportClientsSheet } from './ImportClientsSheet'
import { NewClientSheet } from './NewClientSheet'
import { useTaxIdRules } from './taxId'
import { useIsPhone } from './useIsPhone'

/** Segunda línea: dónde está y cómo llamarlo. Sin datos, queda el aviso de que falta. */
function contactLine(c: Client): string {
  return [c.city, c.phone].filter(Boolean).join(' · ')
}

export default function ClientsPage() {
  const t = useT(es)
  const fmt = useFormat()
  const tax = useTaxIdRules()
  const phone = useIsPhone()
  usePageTitle(t('list.title'))
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim(), 250)
  const list = useClientList(debounced)
  const sheetOpen = params.get('nuevo') === '1'
  const importOpen = params.get('importar') === '1'

  const setFlag = (flag: 'nuevo' | 'importar', open: boolean) => {
    const next = new URLSearchParams(params)
    if (open) next.set(flag, '1')
    else next.delete(flag)
    setParams(next, { replace: true })
  }
  useShortcut('n', () => setFlag('nuevo', true))

  const columns = useMemo<DataTableColumn<Client>[]>(
    () => [
      {
        id: 'name',
        header: t('list.columns.client'),
        value: (c) => c.name,
        minWidth: 240,
        cell: (c) => <RowTitle title={c.name} subtitle={contactLine(c) || t('list.missing.contact')} />,
      },
      {
        id: 'quotes',
        header: t('list.columns.quotes'),
        value: (c) => c.quotesCount ?? 0,
        align: 'right',
        format: (n) => fmt.number(n),
        width: 120,
      },
      {
        id: 'accepted',
        header: t('list.columns.accepted'),
        value: (c) => c.totalAccepted ?? 0,
        align: 'right',
        cell: (c) => (c.totalAccepted ? <Numeric className="font-medium text-fg-strong">{fmt.money(c.totalAccepted)}</Numeric> : <Missing label={t('list.missing.accepted')} />),
        width: 148,
      },
    ],
    [t, fmt],
  )

  const rows = list.data?.items ?? []
  const total = list.data?.total ?? 0
  // El vacío de bienvenida solo cuando la lista llegó de verdad (un error no es «sin clientes»).
  const firstTime = list.isSuccess && !debounced && rows.length === 0
  const searchPlaceholder = tax.chile ? t('list.search') : t('list.searchTaxId')

  return (
    <Page width="default">
      <PageHeader
        title={t('list.title')}
        actions={
          <>
            <Button variant="ghost" icon={Upload} onClick={() => setFlag('importar', true)} className="max-sm:hidden">
              {t('list.import')}
            </Button>
            <Button variant="primary" icon={UserPlus} onClick={() => setFlag('nuevo', true)} title={t('list.newClientHint')} shortcut={phone ? undefined : 'n'}>
              {t('list.newClient')}
            </Button>
          </>
        }
      />
      {firstTime ? (
        <EmptyState
          icon={Users}
          title={t('list.empty.title')}
          description={t('list.empty.description')}
          action={
            <Button variant="secondary" icon={Upload} onClick={() => setFlag('importar', true)}>
              {t('list.import')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Input
              icon={Search}
              size="sm"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={t('list.searchLabel')}
              wrapperClassName="w-full sm:w-80"
            />
            {total > 0 ? <span className="text-table text-fg-muted tabular">{t('list.count', { count: total })}</span> : null}
          </div>
          {list.isError ? (
            <EmptyState
              size="compact"
              title={t('list.error.title')}
              description={humanError(list.error)}
              action={<Button onClick={() => void list.refetch()}>{t('list.error.retry')}</Button>}
            />
          ) : phone ? (
            <PhoneList rows={rows} loading={list.isPending} query={debounced} onClear={() => setQuery('')} />
          ) : (
            <DataTable
              caption={t('list.caption')}
              rows={rows}
              columns={columns}
              getRowId={(c) => c.id}
              query={query}
              searchText={(c) => [c.name, c.rut, c.rut?.replace(/[^0-9kK]/g, ''), c.phone, c.email, c.city].filter(Boolean).join(' ')}
              onClearFilters={query ? () => setQuery('') : undefined}
              onRowClick={(c) => navigate(`/clientes/${c.id}`)}
              loading={list.isPending}
              defaultSort={{ id: 'name', dir: 'asc' }}
              noun={[t('list.nounOne'), t('list.nounOther')]}
              density="comfortable"
              bleed
            />
          )}
        </div>
      )}
      <NewClientSheet open={sheetOpen} onOpenChange={(open) => setFlag('nuevo', open)} />
      <ImportClientsSheet open={importOpen} onOpenChange={(open) => setFlag('importar', open)} existing={rows} />
    </Page>
  )
}

/** Teléfono: la misma lista, una fila por cliente y toda la fila abre la ficha. */
function PhoneList({ rows, loading, query, onClear }: { rows: Client[]; loading: boolean; query: string; onClear: () => void }) {
  const t = useT(es)
  const fmt = useFormat()
  if (loading && rows.length === 0) return <SkeletonRows rows={6} columns={2} />
  if (rows.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={Search}
        title={t('list.noResults.title', { query })}
        description={t('list.noResults.description')}
        action={
          <Button size="sm" onClick={onClear}>
            {t('list.noResults.clear')}
          </Button>
        }
      />
    )
  }
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, t.locale, { sensitivity: 'base' }))
  return (
    <ul aria-label={t('list.caption')} className="-mx-4 divide-y divide-divider bg-plate shadow-plate">
      {sorted.map((c) => (
        <li key={c.id}>
          <Link to={`/clientes/${c.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors duration-100 active:bg-hover focus-visible:outline-offset-[-2px]">
            <RowTitle className="flex-1" title={c.name} subtitle={contactLine(c) || t('list.phoneQuotes', { count: c.quotesCount ?? 0 })} />
            {c.totalAccepted ? <Numeric className="shrink-0 font-medium text-fg-strong">{fmt.money(c.totalAccepted)}</Numeric> : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Celda vacía: guion con contraste AA y, para lectores de pantalla, qué falta. */
function Missing({ label }: { label: string }) {
  return (
    <span className="text-fg-muted" title={label}>
      <span aria-hidden>—</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
