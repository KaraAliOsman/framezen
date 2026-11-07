/**
 * Pestañas de documento de la OT: vista previa escalada del documento de taller, opciones
 * propias y «Imprimir» / «Descargar PDF».
 */
import { useMemo, useState, type ReactElement } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { toSawCsv } from '@dekopen/engine'
import {
  AssemblyChecklistDocument,
  CostDocument,
  CouplersDocument,
  CoverDocument,
  GlassListDocument,
  GlassPlanDocument,
  HardwarePlanDocument,
  hasCouplers,
  hasScreens,
  InstallationDocument,
  LabelsDocument,
  MaterialsDocument,
  PurchaseOrderDocument,
  ReinforcementDocument,
  ScreensDocument,
  SurveyDocument,
  assemblyChecklistSheets,
  workshopDocumentFileName,
  workshopLabelCount,
  type WorkshopDocData,
  type WorkshopDocumentKind,
  type WorkshopPaper,
} from '@dekopen/documents'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { Button, Notice, PlanGate, SegmentedControl, Select, Switch } from '../../../ui'
import { saveBlob } from '../data'
import es from '../i18n/es'
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
  const t = useT(es)
  const fmt = useFormat()
  const element = useMemo(() => <GlassListDocument data={data} paper={paper} />, [data, paper])
  const pieces = data.glass.reduce((s, g) => s + g.qty, 0)
  const area = data.glass.reduce((s, g) => s + g.area * g.qty, 0)
  const kinds = new Set(data.glass.map((g) => g.glassId)).size
  const req = { kind: 'glass' as const, element }
  return (
    <div>
      <DocumentToolbar
        title={t('glass.title')}
        description={pieces > 0 ? t('glass.hint', { pieces, area: fmt.area(Math.round(area * 100) / 100), kinds }) : t('glass.none')}
        onPrint={() => actions.print(req)}
        onDownload={() => void actions.download(req)}
        downloading={actions.busy === 'glass'}
      />
      <DocumentPreview element={element} paper={paper} label={t('glass.preview')} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Materiales (con y sin costos según rol)
// ─────────────────────────────────────────────────────────────────────────────

type MaterialsMode = 'materials' | 'materials-costs' | 'costs'
const MODE_KEY = { materials: 'materials', 'materials-costs': 'withCosts', costs: 'costs' } as const

export function MaterialsTab({ data, paper, actions, allowed }: TabProps & { allowed: ReadonlySet<WorkshopDocumentKind> }) {
  const t = useT(es)
  const modes = (['materials', 'materials-costs', 'costs'] as const).filter((m) => allowed.has(m))
  const [mode, setMode] = useState<MaterialsMode>('materials')
  const current = modes.includes(mode) ? mode : 'materials'
  const element = useMemo(() => {
    if (current === 'costs') return <CostDocument data={data} paper={paper} />
    return <MaterialsDocument data={data} paper={paper} showCosts={current === 'materials-costs'} />
  }, [data, paper, current])
  const req = { kind: current, element }
  const bars = data.materials.filter((m) => m.group === 'profile' || m.group === 'reinforcement').reduce((s, m) => s + (m.bars ?? m.qty), 0)
  const key = MODE_KEY[current]
  const title = t(`materials.${key}.title`)
  return (
    <div>
      <DocumentToolbar
        title={title}
        description={key === 'materials' ? t('materials.materials.description', { bars }) : t(`materials.${key}.description`)}
        options={
          modes.length > 1 ? (
            <SegmentedControl<MaterialsMode>
              aria-label={t('materials.which')}
              value={current}
              onValueChange={setMode}
              options={modes.map((m) => ({ value: m, label: t(`materials.${MODE_KEY[m]}.label`) }))}
            />
          ) : null
        }
        onPrint={() => actions.print(req)}
        onDownload={() => void actions.download(req)}
        downloading={actions.busy === current}
      />
      <DocumentPreview element={element} paper={paper} label={t('materials.preview', { title })} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Montaje
// ─────────────────────────────────────────────────────────────────────────────

export function AssemblyTab({ data, paper, actions }: TabProps) {
  const t = useT(es)
  const sheets = useMemo(() => assemblyChecklistSheets(data), [data])
  const element = useMemo(() => <AssemblyChecklistDocument data={data} paper={paper} />, [data, paper])
  // Con cientos de unidades son cientos de fichas: la vista previa muestra las primeras hojas.
  const previewElement = useMemo(() => <AssemblyChecklistDocument data={data} paper={paper} maxSheets={PREVIEW_LIMITS.assemblySheets} />, [data, paper])
  const req = {
    kind: 'assembly' as const,
    element,
    serverOnly: browserPrintNotice(sheets, BROWSER_PRINT_LIMITS.assemblySheets, 'assemblySheets', t.locale),
  }
  return (
    <div>
      <DocumentToolbar
        title={t('assembly.title')}
        description={t('assembly.hint')}
        onPrint={() => actions.print(req)}
        onDownload={() => void actions.download(req)}
        downloading={actions.busy === 'assembly'}
      />
      <DocumentPreview
        element={previewElement}
        paper={paper}
        label={t('assembly.preview')}
        footer={previewFooter(Math.min(sheets, PREVIEW_LIMITS.assemblySheets), sheets, 'assemblySheets', t.locale)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Carpeta de obra: el resto de los papeles
// ─────────────────────────────────────────────────────────────────────────────

type FolderKind = 'cover' | 'survey' | 'glass-plan' | 'hardware' | 'reinforcement' | 'screens' | 'couplers' | 'installation'

/** Papeles de la carpeta que aplican a esta OT: mosquiteros y acoples, solo si los lleva. */
export function folderDocuments(data: WorkshopDocData): FolderKind[] {
  return (['cover', 'survey', 'glass-plan', 'hardware', 'reinforcement', 'screens', 'couplers', 'installation'] as const).filter(
    (kind) => (kind !== 'screens' || hasScreens(data)) && (kind !== 'couplers' || hasCouplers(data)),
  )
}

function folderElement(kind: FolderKind, data: WorkshopDocData, paper: WorkshopPaper): ReactElement {
  switch (kind) {
    case 'cover':
      return <CoverDocument data={data} paper={paper} />
    case 'survey':
      return <SurveyDocument data={data} paper={paper} />
    case 'glass-plan':
      return <GlassPlanDocument data={data} paper={paper} />
    case 'hardware':
      return <HardwarePlanDocument data={data} paper={paper} />
    case 'reinforcement':
      return <ReinforcementDocument data={data} paper={paper} />
    case 'screens':
      return <ScreensDocument data={data} paper={paper} />
    case 'couplers':
      return <CouplersDocument data={data} paper={paper} />
    case 'installation':
      return <InstallationDocument data={data} paper={paper} />
  }
}

export function FolderTab({ data, paper, actions }: TabProps) {
  const t = useT(es)
  const kinds = useMemo(() => folderDocuments(data), [data])
  const [picked, setPicked] = useState<FolderKind>('cover')
  const kind = kinds.includes(picked) ? picked : 'cover'
  const element = useMemo(() => folderElement(kind, data, paper), [kind, data, paper])
  const req = { kind, element }
  return (
    <div className="grid gap-6 pt-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label={t('folder.label')} className="lg:sticky lg:top-4 lg:self-start">
        <ul className="-mx-2.5 flex flex-col gap-0.5">
          {kinds.map((k) => (
            <li key={k}>
              <button
                type="button"
                aria-current={k === kind ? 'page' : undefined}
                onClick={() => setPicked(k)}
                className={cn('flex min-h-11 w-full flex-col justify-center rounded-sm px-2.5 py-1.5 text-left transition-colors duration-100', k === kind ? 'bg-pressed' : 'hover:bg-hover')}
              >
                <span className="font-medium text-fg-strong">{t(`folder.doc.${k}.title`)}</span>
                <span className="text-meta text-fg-muted">{t(`folder.doc.${k}.hint`)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <DocumentToolbar title={t(`folder.doc.${kind}.title`)} description={t(`folder.doc.${kind}.hint`)} onPrint={() => actions.print(req)} onDownload={() => void actions.download(req)} downloading={actions.busy === kind} />
        <DocumentPreview element={element} paper={paper} label={t('folder.preview', { title: t(`folder.doc.${kind}.title`) })} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Etiquetas
// ─────────────────────────────────────────────────────────────────────────────

export function LabelsTab({ data, paper, actions }: TabProps) {
  const t = useT(es)
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
    serverOnly: browserPrintNotice(total, BROWSER_PRINT_LIMITS.labels, 'labels', t.locale),
  }
  return (
    <div>
      <DocumentToolbar
        title={t('labels.title')}
        description={t('labels.hint', { count: total, sheets: format === 'roll' ? t('labels.roll') : t('labels.sheets', { count: sheets }) })}
        options={
          <>
            <Switch size="sm" label={t('labels.glass')} checked={includeGlass} onCheckedChange={setIncludeGlass} />
            <SegmentedControl<'sheet' | 'roll'>
              aria-label={t('labels.format')}
              value={format}
              onValueChange={setFormat}
              options={[
                { value: 'sheet', label: t('labels.sheet10') },
                { value: 'roll', label: t('labels.rollOption') },
              ]}
            />
          </>
        }
        onPrint={() => actions.print(req)}
        onDownload={() => void actions.download(req)}
        downloading={actions.busy === 'labels'}
      />
      <DocumentPreview element={previewElement} paper={paper} label={t('labels.preview')} footer={previewFooter(shown, total, 'labels', t.locale)} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Compras (Pro)
// ─────────────────────────────────────────────────────────────────────────────

export function PurchaseTab({ data, paper, actions, showCosts, ivaPct, locked }: TabProps & { showCosts: boolean; ivaPct: number; locked: boolean }) {
  const t = useT(es)
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
        title={t('purchase.title')}
        description={orders.length > 0 ? t('purchase.hint', { count: orders.length }) : t('purchase.none')}
        disabled={locked}
        options={
          <>
            {showCosts ? <Switch size="sm" label={t('purchase.prices')} checked={prices} onCheckedChange={setPrices} disabled={locked} /> : null}
            {orders.length > 1 ? (
              <Select
                size="sm"
                className="w-56"
                aria-label={t('purchase.supplier')}
                value={brandId}
                onValueChange={setBrandId}
                disabled={locked}
                options={[
                  { value: 'all', label: t('purchase.allSuppliers', { count: orders.length }) },
                  ...orders.map((o) => ({ value: o.brandId, label: o.brandName, description: t('purchase.lines', { count: o.lines.length }) })),
                ]}
              />
            ) : null}
          </>
        }
        onPrint={() => actions.print(req)}
        onDownload={() => void actions.download(req)}
        downloading={actions.busy === 'purchase'}
      />
      <DocumentPreview element={element} paper={paper} label={t('purchase.preview')} />
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
  const t = useT(es)
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
          <h2 className="text-h3 font-medium text-fg-strong">{t('cnc.title')}</h2>
          <p className="mt-0.5 max-w-2xl text-fg-muted">{t('cnc.hint')}</p>
        </div>
        <Button variant="primary" icon={Download} onClick={download} disabled={locked || body.length === 0}>
          {t('cnc.download')}
        </Button>
      </div>
      {simulated ? (
        <Notice tone="accent" size="compact">
          {t('cnc.simulated')}
        </Notice>
      ) : null}
      <div>
        <div className="flex items-center gap-2 pb-2 text-table text-fg-muted">
          <FileSpreadsheet aria-hidden strokeWidth={1.75} className="size-4" />
          <span className="code-id text-fg">{fileName}</span>
          <span className="ml-auto tabular">{t('cnc.pieces', { count: body.length })}</span>
        </div>
        <div className="scrollbar-quiet overflow-x-auto">
          <table className="w-full min-w-[640px] text-table">
            <thead>
              <tr className="h-9 border-b border-divider text-left text-table text-fg-muted">
                {(head ?? []).map((h, i) => (
                  <th key={i} scope="col" className={i >= 2 && i <= 6 ? 'px-3 py-2 text-right font-normal' : 'px-3 py-2 font-normal'}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {body.slice(0, CSV_PREVIEW_ROWS).map((row, r) => (
                <tr key={r} className="text-fg">
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      className={
                        i === 0 ? 'code-id px-3 py-1.5 text-meta' : i >= 2 && i <= 6 ? `px-3 py-1.5 text-right tabular ${i === 4 ? 'font-semibold text-fg-strong' : ''}` : 'px-3 py-1.5'
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
          <p className="border-t border-divider px-4 py-2.5 text-table text-fg-muted">{t('cnc.more', { count: body.length - CSV_PREVIEW_ROWS })}</p>
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
