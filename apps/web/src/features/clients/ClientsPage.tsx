/**
 * Clientes (SPEC §4): lista con búsqueda (nombre, RUT, teléfono, ciudad; sin tildes), cotizaciones
 * y total aceptado por cliente. «?nuevo=1» abre la hoja de cliente nuevo.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Search, TriangleAlert, UserPlus } from 'lucide-react'
import type { Client } from '@framezen/shared'
import { humanError } from '../../lib/api'
import { formatCLP, formatNumber, formatRelative } from '../../lib/format'
import { usePageTitle } from '../../lib/usePageTitle'
import { useShortcut } from '../../lib/useShortcut'
import { Avatar, Button, DataTable, EmptyState, Input, Page, PageHeader, type DataTableColumn } from '../../ui'
import { useClientList, useDebouncedValue } from './api'
import { NewClientSheet } from './NewClientSheet'
import { rutStatus } from './rut'

export default function ClientsPage() {
  usePageTitle('Clientes')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim(), 250)
  const list = useClientList(debounced)
  const sheetOpen = params.get('nuevo') === '1'

  const setSheet = (open: boolean) => {
    const next = new URLSearchParams(params)
    if (open) next.set('nuevo', '1')
    else next.delete('nuevo')
    setParams(next, { replace: true })
  }
  useShortcut('n', () => setSheet(true))

  const columns = useMemo<DataTableColumn<Client>[]>(
    () => [
      {
        id: 'name',
        header: 'Cliente',
        value: (c) => c.name,
        minWidth: 240,
        cell: (c) => (
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={c.name} size="sm" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-paper-900">{c.name}</span>
              {/* Lo que no cabe en columnas va bajo el nombre: ciudad en el teléfono, teléfono hasta xl. */}
              {c.city || c.phone ? (
                <span className="block truncate text-meta text-paper-600 xl:hidden">
                  {c.city ? <span className="md:hidden">{c.city}</span> : null}
                  {c.city && c.phone ? <span className="md:hidden"> · </span> : null}
                  {c.phone}
                </span>
              ) : null}
            </span>
          </span>
        ),
      },
      {
        id: 'rut',
        header: 'RUT',
        value: (c) => c.rut ?? '',
        cell: (c) =>
          c.rut ? (
            <span className="inline-flex items-center gap-1.5">
              {c.rut}
              {rutStatus(c.rut) === 'invalid' ? (
                <span title="El dígito verificador no calza" className="inline-flex text-warn-600">
                  <TriangleAlert aria-label="RUT por revisar" strokeWidth={1.75} className="size-3.5" />
                </span>
              ) : null}
            </span>
          ) : (
            <Missing label="Sin RUT" />
          ),
        hideBelow: 'xl',
        className: 'tabular',
        width: 130,
      },
      { id: 'phone', header: 'Teléfono', value: (c) => c.phone ?? '', cell: (c) => c.phone || <Missing label="Sin teléfono" />, hideBelow: 'xl', width: 140 },
      { id: 'city', header: 'Ciudad', value: (c) => c.city ?? '', cell: (c) => c.city || <Missing label="Sin ciudad" />, hideBelow: 'md', width: 130 },
      {
        id: 'quotes',
        header: 'Cotizaciones',
        value: (c) => c.quotesCount ?? 0,
        align: 'right',
        format: (n) => formatNumber(n),
        footer: 'sum',
        hideBelow: 'sm',
        width: 116,
      },
      {
        id: 'accepted',
        header: 'Aceptado',
        value: (c) => c.totalAccepted ?? 0,
        align: 'right',
        cell: (c) => (c.totalAccepted ? formatCLP(c.totalAccepted) : <Missing label="Sin ventas aceptadas" />),
        format: (n) => formatCLP(n),
        footer: 'sum',
        width: 130,
        className: 'whitespace-nowrap',
      },
      {
        id: 'updated',
        header: 'Actualizado',
        value: (c) => c.updatedAt,
        cell: (c) => <span className="text-paper-600">{formatRelative(c.updatedAt)}</span>,
        align: 'right',
        hideBelow: 'lg',
        width: 144,
      },
    ],
    [],
  )

  const rows = list.data?.items ?? []
  const total = list.data?.total ?? 0
  // El vacío de bienvenida solo cuando la lista llegó de verdad (un error no es «sin clientes»).
  const firstTime = list.isSuccess && !debounced && rows.length === 0

  return (
    <Page width="wide">
      <PageHeader
        title="Clientes"
        description="Las personas y empresas a las que les cotizas, con lo que ya te compraron."
        actions={
          <Button variant="primary" icon={UserPlus} onClick={() => setSheet(true)} title="Nuevo cliente (N)">
            Nuevo cliente
          </Button>
        }
      />
      {firstTime ? (
        <div className="rounded-lg border border-paper-200 bg-paper-0">
          <EmptyState
            sketch="door"
            title="Tus clientes aparecerán aquí"
            description="No hace falta crearlos antes: al cotizar, escribe el nombre y queda guardado. También puedes agregarlos ahora."
            action={
              <Button variant="secondary" icon={UserPlus} onClick={() => setSheet(true)}>
                Agregar cliente
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Input
              icon={Search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, RUT o teléfono"
              aria-label="Buscar clientes"
              wrapperClassName="w-full sm:w-96"
            />
            {total > 0 ? (
              <span className="text-[13px] text-paper-600">
                {formatNumber(total)} {total === 1 ? 'cliente' : 'clientes'}
              </span>
            ) : null}
          </div>
          {list.isError ? (
            <div className="rounded-lg border border-paper-200 bg-paper-0">
              <EmptyState
                sketch="fixed"
                size="compact"
                title="No pudimos cargar tus clientes"
                description={humanError(list.error)}
                action={<Button onClick={() => void list.refetch()}>Reintentar</Button>}
              />
            </div>
          ) : (
            <DataTable
              caption="Clientes"
              rows={rows}
              columns={columns}
              getRowId={(c) => c.id}
              query={query}
              searchText={(c) => [c.name, c.rut, c.rut?.replace(/[^0-9kK]/g, ''), c.phone, c.email, c.city].filter(Boolean).join(' ')}
              onClearFilters={query ? () => setQuery('') : undefined}
              onRowClick={(c) => navigate(`/clientes/${c.id}`)}
              loading={list.isPending}
              defaultSort={{ id: 'name', dir: 'asc' }}
              noun={['cliente', 'clientes']}
            />
          )}
        </div>
      )}
      <NewClientSheet open={sheetOpen} onOpenChange={setSheet} />
    </Page>
  )
}

/** Celda vacía: guion con contraste AA y, para lectores de pantalla, qué falta. */
function Missing({ label }: { label: string }) {
  return (
    <span className="text-paper-600" title={label}>
      <span aria-hidden>—</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
