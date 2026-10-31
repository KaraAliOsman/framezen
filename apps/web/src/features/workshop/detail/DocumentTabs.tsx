/**
 * Pestañas de documento de la OT: vista previa escalada del documento de taller, opciones
 * propias y «Imprimir» / «Descargar PDF».
 */
import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { toSawCsv } from '@framezen/engine'
import {
  AssemblyChecklistDocument,
  CostDocument,
  GlassListDocument,
  LabelsDocument,
  MaterialsDocument,
  PurchaseOrderDocument,
  assemblyChecklistSheets,
  workshopDocumentFileName,
  workshopLabelCount,
  type WorkshopDocData,
  type WorkshopDocumentKind,
  type WorkshopPaper,
} from '@framezen/documents'
import { formatArea, formatNumber } from '../../../lib/format'
import { Button, PlanGate, SegmentedControl, Select, Switch } from '../../../ui'
import { saveBlob } from '../data'
import { BROWSER_PRINT_LIMITS, PREVIEW_LIMITS, browserPrintNotice, previewFooter } from '../model/preview'
import { DocumentPreview, DocumentToolbar } from './DocumentPreview'
import type { useDocumentActions } from './useDocumentActions'

type Actions = ReturnType<typeof useDocumentActions>

interface TabProps {
  data: WorkshopDocData
  paper: WorkshopPaper
  actions: Actions
}

// ─────────────────────────────────────────────────────────────────────────────
// Vidrios
// ─────────────────────────────────────────────────────────────────────────────

export function GlassTab({ data, paper, actions }: TabProps) {
  const element = useMemo(() => <GlassListDocument data={data} paper={paper} />, [data, paper])
  const pieces = data.glass.reduce((s, g) => s + g.qty, 0)
  const area = data.glass.reduce((s, g) => s + g.area * g.qty, 0)
  const kinds = new Set(data.glass.map((g) => g.glassId)).size
  const req = { kind: 'glass' as const, element }
  return (
    <div>
      <DocumentToolbar
        title="Pedido de vidrios"
        description={
          pieces > 0
            ? `${formatNumber(pieces)} ${pieces === 1 ? 'vidrio' : 'vidrios'} · ${formatArea(Math.round(area * 100) / 100)} · ${kinds} ${kinds === 1 ? 'tipo' : 'tipos'}. Para el proveedor: sin datos del cliente.`
            : 'Esta OT no lleva vidrios.'
        }
        onPrint={() => actions.print(req)}
        onDownload={() => void actions.download(req)}
        downloading={actions.busy === 'glass'}
      />
      <DocumentPreview element={element} paper={paper} label="Vista previa del pedido de vidrios" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Materiales (con y sin costos según rol)
// ─────────────────────────────────────────────────────────────────────────────

type MaterialsMode = 'materials' | 'materials-costs' | 'costs'

export function MaterialsTab({ data, paper, actions, allowed }: TabProps & { allowed: ReadonlySet<WorkshopDocumentKind> }) {
  const modes = (['materials', 'materials-costs', 'costs'] as const).filter((m) => allowed.has(m))
  const [mode, setMode] = useState<MaterialsMode>('materials')
  const current = modes.includes(mode) ? mode : 'materials'
  const element = useMemo(() => {
    if (current === 'costs') return <CostDocument data={data} paper={paper} />
    return <MaterialsDocument data={data} paper={paper} showCosts={current === 'materials-costs'} />
  }, [data, paper, current])
  const req = { kind: current, element }
  const bars = data.materials.filter((m) => m.group === 'profile' || m.group === 'reinforcement').reduce((s, m) => s + (m.bars ?? m.qty), 0)
  const copy: Record<MaterialsMode, { title: string; description: string; label: string }> = {
    materials: {
      title: 'Lista de materiales',
      description: `Para bodega: ${formatNumber(bars)} barras por perfil y color, herrajes y accesorios redondeados al envase.`,
      label: 'Para bodega',
    },
    'materials-costs': {
      title: 'Materiales con costos',
      description: 'La misma lista con el costo de compra de cada línea, con tus descuentos.',
      label: 'Con costos',
    },
    costs: {
      title: 'Costos internos',
      description: 'Costo por familia y por ventana, precio y margen. Solo para la oficina.',
      label: 'Costos internos',
    },
  }
  return (
    <div>
      <DocumentToolbar
        title={copy[current].title}
        description={copy[current].description}
        options={
          modes.length > 1 ? (
            <SegmentedControl<MaterialsMode>
              aria-label="Qué lista ver"
              value={current}
              onValueChange={setMode}
              options={modes.map((m) => ({ value: m, label: copy[m].label }))}
            />
          ) : null
        }
        onPrint={() => actions.print(req)}
        onDownload={() => void actions.download(req)}
        downloading={actions.busy === current}
      />
      <DocumentPreview element={element} paper={paper} label={`Vista previa: ${copy[current].title}`} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Montaje
// ─────────────────────────────────────────────────────────────────────────────

export function AssemblyTab({ data, paper, actions }: TabProps) {
  const sheets = useMemo(() => assemblyChecklistSheets(data), [data])
  const element = useMemo(() => <AssemblyChecklistDocument data={data} paper={paper} />, [data, paper])
  // Con cientos de unidades son cientos de fichas: la vista previa muestra las primeras hojas.
  const previewElement = useMemo(
    () => <AssemblyChecklistDocument data={data} paper={paper} maxSheets={PREVIEW_LIMITS.assemblySheets} />,
    [data, paper],
  )
  const req = {
    kind: 'assembly' as const,
    element,
    serverOnly: browserPrintNotice(sheets, BROWSER_PRINT_LIMITS.assemblySheets, 'hojas de montaje'),
  }
  return (
    <div>
      <DocumentToolbar
        title="Listado de montaje"
        description="Controles por ventana con casillas por unidad, medida real y firmas de quien armó y controló."
        onPrint={() => actions.print(req)}
        onDownload={() => void actions.download(req)}
        downloading={actions.busy === 'assembly'}
      />
      <DocumentPreview
        element={previewElement}
        paper={paper}
        label="Vista previa del listado de montaje"
        footer={previewFooter(Math.min(sheets, PREVIEW_LIMITS.assemblySheets), sheets, 'hojas')}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Etiquetas
// ─────────────────────────────────────────────────────────────────────────────

export function LabelsTab({ data, paper, actions }: TabProps) {
  const [format, setFormat] = useState<'sheet' | 'roll'>('sheet')
  const [includeGlass, setIncludeGlass] = useState(true)
  // Se cuentan sin armarlas: con miles de unidades armar todas las etiquetas ya pesa.
  const total = useMemo(() => workshopLabelCount(data, { includeGlass }), [data, includeGlass])
  const shown = Math.min(total, PREVIEW_LIMITS.labels)
  const element = useMemo(
    () => <LabelsDocument data={data} paper={paper} format={format} includeGlass={includeGlass} />,
    [data, paper, format, includeGlass],
  )
  // La vista previa dibuja solo las primeras etiquetas, aunque sean todas de una misma ventana.
  const previewElement = useMemo(
    () => <LabelsDocument data={data} paper={paper} format={format} includeGlass={includeGlass} limit={PREVIEW_LIMITS.labels} />,
    [data, paper, format, includeGlass],
  )
  const sheets = format === 'roll' ? total : Math.ceil(total / 10)
  const req = {
    kind: 'labels' as const,
    element,
    // El servidor lee el formato en `labels` (sheet|roll) y `glass=0` quita las de vidrio.
    params: { labels: format, glass: includeGlass ? 1 : 0 },
    serverOnly: browserPrintNotice(total, BROWSER_PRINT_LIMITS.labels, 'etiquetas'),
  }
  return (
    <div>
      <DocumentToolbar
        title="Etiquetas de piezas"
        description={`${formatNumber(total)} etiquetas de 100 × 50 mm con QR, código de pieza y medida grande · ${formatNumber(sheets)} ${
          format === 'roll' ? 'en rollo' : sheets === 1 ? 'hoja' : 'hojas'
        }.`}
        options={
          <>
            <Switch size="sm" label="Incluir vidrios" checked={includeGlass} onCheckedChange={setIncludeGlass} />
            <SegmentedControl<'sheet' | 'roll'>
              aria-label="Formato de etiquetas"
              value={format}
              onValueChange={setFormat}
              options={[
                { value: 'sheet', label: 'Hoja de 10' },
                { value: 'roll', label: 'Rollo' },
              ]}
            />
          </>
        }
        onPrint={() => actions.print(req)}
        onDownload={() => void actions.download(req)}
        downloading={actions.busy === 'labels'}
      />
      <DocumentPreview
        element={previewElement}
        paper={paper}
        label="Vista previa de las etiquetas"
        footer={previewFooter(shown, total, 'etiquetas')}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Compras (Pro)
// ─────────────────────────────────────────────────────────────────────────────

export function PurchaseTab({ data, paper, actions, showCosts, ivaPct, locked }: TabProps & { showCosts: boolean; ivaPct: number; locked: boolean }) {
  const [brandId, setBrandId] = useState<string>('all')
  const [prices, setPrices] = useState(showCosts)
  const brand = brandId === 'all' ? undefined : brandId
  const withPrices = showCosts && prices
  const element = useMemo(
    () => <PurchaseOrderDocument data={data} paper={paper} brandId={brand} showPrices={withPrices} ivaPct={ivaPct} />,
    [data, paper, brand, withPrices, ivaPct],
  )
  const req = {
    kind: 'purchase' as const,
    element,
    // El servidor respeta `brandId` y `prices=0`, y usa el IVA del taller (el mismo de la vista previa).
    params: { brandId: brand, prices: withPrices ? 1 : 0 },
  }
  const orders = data.purchaseOrders
  const body = (
    <div>
      <DocumentToolbar
        title="Órdenes de compra"
        description={
          orders.length > 0
            ? `${orders.length} ${orders.length === 1 ? 'proveedor' : 'proveedores'}, una orden por cada uno, lista para enviar.`
            : 'No hay materiales por comprar en esta OT.'
        }
        disabled={locked}
        options={
          <>
            {showCosts ? <Switch size="sm" label="Con precios" checked={prices} onCheckedChange={setPrices} disabled={locked} /> : null}
            {orders.length > 1 ? (
              <Select
                size="sm"
                className="w-56"
                aria-label="Proveedor"
                value={brandId}
                onValueChange={setBrandId}
                disabled={locked}
                options={[
                  { value: 'all', label: `Todos los proveedores (${orders.length})` },
                  ...orders.map((o) => ({ value: o.brandId, label: o.brandName, description: `${o.lines.length} ${o.lines.length === 1 ? 'línea' : 'líneas'}` })),
                ]}
              />
            ) : null}
          </>
        }
        onPrint={() => actions.print(req)}
        onDownload={() => void actions.download(req)}
        downloading={actions.busy === 'purchase'}
      />
      <DocumentPreview element={element} paper={paper} label="Vista previa de las órdenes de compra" />
    </div>
  )
  return (
    <PlanGate feature="purchasing" allowed={!locked}>
      {body}
    </PlanGate>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CNC (Pro): CSV para sierra
// ─────────────────────────────────────────────────────────────────────────────

const CSV_PREVIEW_ROWS = 24

export function CncTab({ data, orderNumber, locked, simulated }: { data: WorkshopDocData; orderNumber: number; locked: boolean; simulated: boolean }) {
  const csv = useMemo(() => toSawCsv(data.optimization, data.catalog?.colors ?? []), [data])
  const rows = useMemo(
    () =>
      csv
        .replace(/^﻿/, '')
        .split('\r\n')
        .filter(Boolean)
        .map((line) => line.split(';')),
    [csv],
  )
  const [head, ...body] = rows
  const fileName = workshopDocumentFileName('cuts', orderNumber, 'csv').replace('-Cortes', '-Sierra')
  const download = () => saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName)

  const content = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-h3 font-semibold tracking-[-0.01em] text-paper-900">Lista de cortes para la sierra</h2>
          <p className="mt-0.5 max-w-2xl text-paper-600">
            Una fila por pieza en el orden de corte de la optimización: perfil, color, barra, largo y ángulos. Separado por punto y
            coma, con coma decimal: lo abren las sierras con importación CSV y Excel.
          </p>
        </div>
        <Button variant="primary" icon={Download} onClick={download} disabled={locked || body.length === 0}>
          Descargar CSV
        </Button>
      </div>
      {simulated ? (
        <p className="rounded-md border border-ink-100 bg-ink-50 px-3.5 py-2.5 text-[13px] text-ink-700">
          El CSV usa los ajustes de corte que estás simulando.
        </p>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0">
        <div className="flex items-center gap-2 border-b border-paper-200 px-4 py-2.5 text-[13px] text-paper-600">
          <FileSpreadsheet aria-hidden strokeWidth={1.75} className="size-4" />
          <span className="font-mono text-paper-900">{fileName}</span>
          <span className="ml-auto tabular">
            {formatNumber(body.length)} {body.length === 1 ? 'pieza' : 'piezas'}
          </span>
        </div>
        <div className="scrollbar-quiet overflow-x-auto">
          <table className="w-full min-w-[640px] text-table">
            <thead>
              <tr className="border-b border-paper-200 bg-paper-50 text-left text-meta text-paper-600">
                {(head ?? []).map((h, i) => (
                  <th key={i} scope="col" className={i >= 2 && i <= 6 ? 'px-3 py-2 text-right font-medium' : 'px-3 py-2 font-medium'}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-100">
              {body.slice(0, CSV_PREVIEW_ROWS).map((row, r) => (
                <tr key={r} className="text-paper-900">
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      className={
                        i === 0
                          ? 'px-3 py-1.5 font-mono text-[12px]'
                          : i >= 2 && i <= 6
                            ? `px-3 py-1.5 text-right tabular ${i === 4 ? 'font-semibold' : ''}`
                            : 'px-3 py-1.5'
                      }
                    >
                      {cell.replace(/^"|"$/g, '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {body.length > CSV_PREVIEW_ROWS ? (
          <p className="border-t border-paper-200 px-4 py-2.5 text-[13px] text-paper-600">
            Y {formatNumber(body.length - CSV_PREVIEW_ROWS)} piezas más en el archivo.
          </p>
        ) : null}
      </div>
    </div>
  )
  return (
    <PlanGate feature="cnc" allowed={!locked}>
      {content}
    </PlanGate>
  )
}
