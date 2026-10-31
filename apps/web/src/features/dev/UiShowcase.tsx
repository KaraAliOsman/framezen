/**
 * /dev/ui — vitrina de todos los componentes base. Sirve para revisar diseño, accesibilidad y
 * modo oscuro de un vistazo. No requiere sesión ni servidor.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  AppWindow,
  Copy,
  DoorOpen,
  Download,
  FilePlus2,
  FileText,
  Layers,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  RulerDimensionLine,
  Scissors,
  Search,
  Send,
  Sun,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react'
import type { QuoteStatus } from '@framezen/shared'
import { formatArea, formatCLP, formatSize } from '../../lib/format'
import { useTheme } from '../../lib/theme'
import { usePageTitle } from '../../lib/usePageTitle'
import { useUndo } from '../../lib/useUndo'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ColorSwatch,
  ColorSwatchGroup,
  Combobox,
  CommandPalette,
  DataTable,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  Flash,
  FramezenLogo,
  FramezenMark,
  IconButton,
  Input,
  Kbd,
  KPI,
  MoneyField,
  NumberField,
  PageHeader,
  Panel,
  PlanGate,
  Popover,
  PopoverContent,
  PopoverTrigger,
  QUOTE_STATUS_ORDER,
  RadioCards,
  SaveIndicator,
  SegmentedControl,
  Select,
  Sheet,
  SheetContent,
  SheetTrigger,
  Skeleton,
  SkeletonRows,
  SkeletonText,
  Slider,
  StatusPill,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
  toastUndo,
  Tooltip,
  WindowSketch,
  type ComboboxOption,
  type DataTableColumn,
  type SaveStatus,
  type SketchKind,
} from '../../ui'

const SECTIONS = [
  ['marca', 'Marca y color'],
  ['tipografia', 'Tipografía'],
  ['botones', 'Botones'],
  ['campos', 'Campos'],
  ['seleccion', 'Selección'],
  ['estados', 'Estados y etiquetas'],
  ['superficies', 'Superficies'],
  ['superposiciones', 'Superposiciones'],
  ['tabla', 'Tabla de datos'],
  ['plan', 'Límites de plan'],
  ['dibujos', 'Dibujos'],
] as const

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t border-paper-200 py-12 first:border-t-0 first:pt-0">
      <h2 id={`${id}-h`} className="text-h3 font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      {description ? <p className="mt-1 max-w-2xl text-paper-600">{description}</p> : null}
      <div className="mt-6 flex flex-col gap-8">{children}</div>
    </section>
  )
}

function Demo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div>
      <div className="mb-2.5 text-meta font-medium text-paper-600">{label}</div>
      <div className={className ?? 'flex flex-wrap items-center gap-3'}>{children}</div>
    </div>
  )
}

const TOKENS: { name: string; var: string }[] = [
  { name: 'paper-0', var: '--paper-0' },
  { name: 'paper-50', var: '--paper-50' },
  { name: 'paper-100', var: '--paper-100' },
  { name: 'paper-200', var: '--paper-200' },
  { name: 'paper-350', var: '--paper-350' },
  { name: 'paper-600', var: '--paper-600' },
  { name: 'paper-900', var: '--paper-900' },
  { name: 'ink-50', var: '--ink-50' },
  { name: 'ink-100', var: '--ink-100' },
  { name: 'ink-500', var: '--ink-500' },
  { name: 'ink-600', var: '--ink-600' },
  { name: 'ink-700', var: '--ink-700' },
  { name: 'ok-50', var: '--ok-50' },
  { name: 'ok-600', var: '--ok-600' },
  { name: 'warn-50', var: '--warn-50' },
  { name: 'warn-600', var: '--warn-600' },
  { name: 'bad-50', var: '--bad-50' },
  { name: 'bad-600', var: '--bad-600' },
]

const MATERIALS = [
  { id: 'white', name: 'Blanco', hex: '#F6F5F1' },
  { id: 'anthracite', name: 'Antracita', hex: '#383E42' },
  { id: 'black', name: 'Negro', hex: '#0E0E10' },
  { id: 'golden-oak', name: 'Roble dorado', hex: '#A8692E' },
  { id: 'walnut', name: 'Nogal', hex: '#5B3A22' },
  { id: 'winchester', name: 'Winchester', hex: '#7A4A2A' },
]

interface SampleQuote {
  id: string
  number: number
  title: string
  client: string
  status: QuoteStatus
  units: number
  area: number
  total: number
  updated: string
}

const SAMPLE_QUOTES: SampleQuote[] = [
  { id: 'q1', number: 412, title: 'Casa Pérez · Concepción', client: 'Pedro Pérez', status: 'sent', units: 6, area: 9.84, total: 2_384_900, updated: '2026-10-30' },
  { id: 'q2', number: 411, title: 'Edificio Las Rosas, depto 504', client: 'Inmobiliaria Austral', status: 'accepted', units: 14, area: 22.1, total: 5_912_300, updated: '2026-10-29' },
  { id: 'q3', number: 410, title: 'Cambio ventanas living', client: 'María José Soto', status: 'draft', units: 3, area: 4.2, total: 986_400, updated: '2026-10-29' },
  { id: 'q4', number: 409, title: 'Quincho y terraza', client: 'Rodrigo Muñoz', status: 'workshop', units: 4, area: 11.5, total: 3_104_000, updated: '2026-10-27' },
  { id: 'q5', number: 408, title: 'Oficina Centro', client: 'Estudio Ñuble', status: 'rejected', units: 8, area: 12.9, total: 3_455_800, updated: '2026-10-25' },
  { id: 'q6', number: 407, title: 'Casa Valdivia', client: 'Camila Rojas', status: 'installed', units: 9, area: 15.3, total: 4_210_700, updated: '2026-10-20' },
]

const CLIENT_OPTIONS: ComboboxOption[] = [
  { value: 'c1', label: 'Pedro Pérez', hint: 'Concepción' },
  { value: 'c2', label: 'María José Soto', hint: 'Talcahuano' },
  { value: 'c3', label: 'Inmobiliaria Austral', hint: '76.123.456-7' },
  { value: 'c4', label: 'Rodrigo Muñoz', hint: 'Chillán' },
]

function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  return (
    <IconButton
      icon={resolved === 'dark' ? Sun : Moon}
      label={resolved === 'dark' ? 'Tema claro' : 'Tema oscuro'}
      variant="secondary"
      onClick={toggle}
    />
  )
}

export default function UiShowcase() {
  usePageTitle('Componentes')

  // Campos
  const [width, setWidth] = useState<number | null>(1200)
  const [height, setHeight] = useState<number | null>(1500)
  const [price, setPrice] = useState<number | null>(184_900)
  const [line, setLine] = useState<string>('pro6004')
  const [clients, setClients] = useState(CLIENT_OPTIONS)
  const [client, setClient] = useState<string | undefined>('c1')
  const [notes, setNotes] = useState('Instalar con tapajuntas por fuera.')

  // Selección
  const [view, setView] = useState<'design' | 'document'>('design')
  const [install, setInstall] = useState(true)
  const [showArea, setShowArea] = useState(true)
  const [marginMode, setMarginMode] = useState<'margin' | 'markup'>('margin')
  const [margin, setMargin] = useState(40)
  const [color, setColor] = useState('white')

  // Estados
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [kpi, setKpi] = useState(18_420_000)

  // Superposiciones
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Tabla
  const quotes = useUndo<SampleQuote[]>(SAMPLE_QUOTES)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | QuoteStatus>('all')

  useEffect(() => {
    if (saveStatus !== 'saving') return
    const t = setTimeout(() => setSaveStatus('saved'), 900)
    return () => clearTimeout(t)
  }, [saveStatus])

  const columns = useMemo<DataTableColumn<SampleQuote>[]>(
    () => [
      {
        id: 'number',
        header: 'N°',
        value: (q) => q.number,
        width: 72,
        cell: (q) => <span className="font-medium text-paper-900 tabular">{q.number}</span>,
      },
      {
        id: 'title',
        header: 'Obra',
        value: (q) => q.title,
        edit: {
          type: 'text',
          label: (q) => `Editar nombre de la obra ${q.number}`,
          onCommit: (row, value) =>
            quotes.set((list) => list.map((q) => (q.id === row.id ? { ...q, title: String(value ?? '') } : q))),
        },
      },
      { id: 'client', header: 'Cliente', value: (q) => q.client, hideBelow: 'md', minWidth: 160 },
      { id: 'status', header: 'Estado', value: (q) => q.status, cell: (q) => <StatusPill status={q.status} />, width: 130 },
      { id: 'units', header: 'Unid.', value: (q) => q.units, align: 'right', width: 72, footer: 'sum', hideBelow: 'lg' },
      { id: 'area', header: 'm²', value: (q) => q.area, align: 'right', width: 96, footer: 'sum', format: formatArea, hideBelow: 'lg' },
      {
        id: 'total',
        header: 'Total neto',
        value: (q) => q.total,
        align: 'right',
        width: 140,
        footer: 'sum',
        format: formatCLP,
        edit: {
          type: 'money',
          label: (q) => `Editar total de la cotización ${q.number}`,
          onCommit: (row, value) =>
            quotes.set((list) => list.map((q) => (q.id === row.id ? { ...q, total: Number(value ?? 0) } : q))),
        },
      },
    ],
    [quotes],
  )

  const sketches: { kind: SketchKind; label: string }[] = [
    { kind: 'casement', label: 'Abatir' },
    { kind: 'tilt_turn', label: 'Oscilobatiente' },
    { kind: 'double', label: 'Abatir 2 hojas' },
    { kind: 'sliding', label: 'Corredera' },
    { kind: 'transom', label: 'Con sobreluz' },
    { kind: 'fixed', label: 'Fijo' },
    { kind: 'triple', label: 'Abatir + fijo + abatir' },
    { kind: 'door', label: 'Puerta' },
  ]

  return (
    <div className="min-h-dvh bg-paper-50">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-paper-200 bg-paper-50 px-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="rounded-sm text-paper-900" aria-label="Framezen">
            <FramezenLogo size="sm" />
          </Link>
          <Badge tone="outline">Componentes</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={Search} shortcut="mod+k" onClick={() => setPaletteOpen(true)}>
            Paleta
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-6 py-10">
        <nav aria-label="Secciones" className="sticky top-24 hidden h-fit w-44 shrink-0 lg:block">
          <ul className="flex flex-col gap-0.5 text-[13px]">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-sm px-2 py-1.5 text-paper-600 hover:bg-paper-100 hover:text-paper-900">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">
          <PageHeader
            title="Papel y tinta"
            description="Los componentes base de Framezen. Bordes antes que sombras, un solo acento tinta, cifras tabulares y foco siempre visible."
          />

          <Section id="marca" title="Marca y color">
            <Demo label="Logotipo y marca">
              <FramezenLogo size="lg" />
              <FramezenLogo size="md" />
              <FramezenLogo size="sm" />
              <span className="inline-flex size-12 items-center justify-center rounded-md border border-paper-200 bg-paper-0 text-paper-900">
                <FramezenMark size={28} />
              </span>
              <span className="inline-flex size-12 items-center justify-center rounded-md bg-paper-900 text-paper-0">
                <FramezenMark size={28} />
              </span>
              <img src="/favicon.svg" alt="Favicon" className="size-8" />
            </Demo>
            <Demo label="Tokens" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {TOKENS.map((t) => (
                <div key={t.name} className="overflow-hidden rounded-sm border border-paper-200 bg-paper-0">
                  <div className="h-10" style={{ background: `var(${t.var})` }} />
                  <div className="px-2 py-1.5 font-mono text-[11px] text-paper-600">{t.name}</div>
                </div>
              ))}
            </Demo>
            <Demo label="Colores de material">
              {MATERIALS.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-2 text-[13px] text-paper-600">
                  <ColorSwatch hex={m.hex} name={m.name} />
                  {m.name}
                </span>
              ))}
              <span className="inline-flex items-center gap-2 text-[13px] text-paper-600">
                <ColorSwatch hex="#F6F5F1" hexIn="#5B3A22" name="Bicolor blanco y nogal" />
                Bicolor
              </span>
            </Demo>
          </Section>

          <Section id="tipografia" title="Tipografía" description="Instrument Sans para todo; JetBrains Mono solo para códigos de catálogo y atajos.">
            <div className="flex flex-col gap-3">
              <p className="text-display font-semibold tracking-[-0.02em]">Cotiza en segundos</p>
              <p className="text-h1 font-semibold tracking-[-0.01em]">Cotización N° 412</p>
              <p className="text-h2 font-semibold tracking-[-0.01em]">Casa Pérez · Concepción</p>
              <p className="text-h3 font-semibold">Corredera 2 hojas</p>
              <p className="text-lead text-paper-900">Elige la ventana, escribe ancho × alto y el precio aparece solo.</p>
              <p className="text-base">Texto base de 14 px para la interfaz, con cifras tabulares: {formatCLP(1234567)} · {formatSize(1200, 1500)}</p>
              <p className="text-table text-paper-600 narrow tabular">Tabla densa: 2.384.900 · 9,84 m² · 1.249,5 mm</p>
              <p className="text-meta text-paper-600">
                Meta 12 px · código <code className="font-mono text-paper-900">PRO6004</code> · atajo <Kbd combo="mod+k" />
              </p>
            </div>
          </Section>

          <Section id="botones" title="Botones">
            <Demo label="Variantes">
              <Button variant="primary" icon={Send}>
                Enviar al cliente
              </Button>
              <Button variant="secondary" icon={Scissors}>
                Pasar a taller
              </Button>
              <Button variant="ghost" icon={Copy}>
                Duplicar
              </Button>
              <Button variant="danger" icon={Trash2}>
                Borrar definitivamente
              </Button>
            </Demo>
            <Demo label="Tamaños, atajos y carga">
              <Button variant="primary" size="sm">
                Pequeño
              </Button>
              <Button variant="primary" size="md" icon={Plus} shortcut="a">
                Agregar ventana
              </Button>
              <Button variant="primary" size="lg">
                Crear cuenta
              </Button>
              <Button variant="secondary" loading>
                Guardando
              </Button>
              <Button variant="secondary" disabled>
                Desactivado
              </Button>
            </Demo>
            <Demo label="Botones de icono (con tooltip)">
              <IconButton icon={Pencil} label="Editar" />
              <IconButton icon={Copy} label="Duplicar" shortcut="d" />
              <IconButton icon={Download} label="Descargar PDF" variant="secondary" />
              <IconButton icon={Plus} label="Agregar" variant="primary" />
              <IconButton icon={Trash2} label="Eliminar" shortcut="delete" size="sm" />
            </Demo>
            <Demo label="Teclas">
              <Kbd combo="mod+k" />
              <Kbd combo="shift+mod+z" />
              <Kbd combo="a" />
              <Kbd combo="delete" />
              <Kbd combo="escape" />
            </Demo>
          </Section>

          <Section id="campos" title="Campos" description="36 px de alto (44 en pantallas táctiles), borde con contraste 3:1 y errores que dicen cómo seguir.">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Ancho" hint="Prueba «1200x1500», las flechas (Shift = 100) o la rueda.">
                <NumberField
                  value={width}
                  onChange={setWidth}
                  onSizeInput={({ width: w, height: h }) => {
                    setWidth(w)
                    setHeight(h)
                  }}
                  min={200}
                  max={6000}
                />
              </Field>
              <Field label="Alto">
                <NumberField
                  value={height}
                  onChange={setHeight}
                  onSizeInput={({ width: w, height: h }) => {
                    setWidth(w)
                    setHeight(h)
                  }}
                  min={200}
                  max={6000}
                />
              </Field>
              <Field label="Medida grande (galería de tipologías)">
                <NumberField value={width} onChange={setWidth} size="lg" min={200} max={6000} />
              </Field>
              <Field label="Precio manual" hint={price !== null ? `Neto: ${formatCLP(price)}` : 'Sin precio manual: usa el calculado.'}>
                <MoneyField value={price} onChange={setPrice} suffix="+ IVA" />
              </Field>
              <Field label="Buscar">
                <Input icon={Search} placeholder="Cotización, cliente u obra" />
              </Field>
              <Field label="Correo" error="Revisa el correo: parece que le falta el @.">
                <Input defaultValue="ana.taller.cl" />
              </Field>
              <Field label="Línea">
                <Select
                  value={line}
                  onValueChange={setLine}
                  options={[
                    { value: 'pro6004', label: 'PRO6004', description: 'Practicable 60 mm · 4 cámaras' },
                    { value: 'prosld70', label: 'PROSLD70', description: 'Corredera 70 mm' },
                    { value: 'europa', label: 'Europa 58', description: 'Practicable 58 mm', disabled: true },
                  ]}
                />
              </Field>
              <Field label="Cliente" hint="Escribe un nombre nuevo para crearlo sin salir de aquí.">
                <Combobox
                  value={client}
                  onChange={setClient}
                  options={clients}
                  placeholder="Sin cliente (opcional)"
                  searchPlaceholder="Buscar o crear cliente…"
                  clearable
                  clearLabel="Sin cliente"
                  createLabel={(q) => (
                    <>
                      Crear cliente <span className="font-medium">«{q}»</span>
                    </>
                  )}
                  onCreate={(name) => {
                    const id = `c${Date.now()}`
                    setClients((list) => [...list, { value: id, label: name }])
                    setClient(id)
                    toast.success(`Creamos a ${name}.`)
                  }}
                />
              </Field>
              <Field label="Notas para el taller" optional className="sm:col-span-2">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section id="seleccion" title="Selección">
            <Demo label="Control segmentado">
              <SegmentedControl
                aria-label="Vista"
                value={view}
                onValueChange={setView}
                options={[
                  { value: 'design', label: 'Diseño', icon: RulerDimensionLine },
                  { value: 'document', label: 'Documento', icon: FileText },
                ]}
              />
              <SegmentedControl
                aria-label="Vista exterior o interior"
                size="sm"
                value="in"
                onValueChange={() => undefined}
                options={[
                  { value: 'in', label: 'Interior' },
                  { value: 'out', label: 'Exterior' },
                ]}
              />
            </Demo>
            <Demo label="Pestañas" className="block">
              <Tabs defaultValue="cortes">
                <TabsList>
                  <TabsTrigger value="resumen">Resumen</TabsTrigger>
                  <TabsTrigger value="cortes" badge={24}>
                    Cortes
                  </TabsTrigger>
                  <TabsTrigger value="vidrios" badge={8}>
                    Vidrios
                  </TabsTrigger>
                  <TabsTrigger value="compras" badge="Pro">
                    Compras
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="resumen" className="text-paper-600">
                  Resumen de la orden de trabajo.
                </TabsContent>
                <TabsContent value="cortes" className="text-paper-600">
                  24 cortes en 6 barras · aprovechamiento 94,2 %.
                </TabsContent>
                <TabsContent value="vidrios" className="text-paper-600">
                  8 vidrios DVH 4+12+4.
                </TabsContent>
                <TabsContent value="compras" className="text-paper-600">
                  Órdenes de compra por proveedor.
                </TabsContent>
              </Tabs>
            </Demo>
            <div className="grid gap-6 sm:grid-cols-2">
              <Demo label="Interruptores y casillas" className="flex flex-col gap-4">
                <Switch checked={install} onCheckedChange={setInstall} label="Incluir instalación" description="Se suma por m² a cada ventana." />
                <Switch size="sm" checked={showArea} onCheckedChange={setShowArea} label="Mostrar m² en el documento" />
                <Checkbox defaultChecked label="Mostrar precio unitario" />
                <Checkbox checked="indeterminate" label="Algunas ventanas con mosquitero" />
              </Demo>
              <Demo label="Margen" className="flex flex-col gap-4">
                <Slider aria-label="Margen sobre venta" value={margin} onValueChange={setMargin} min={0} max={70} format={(v) => `${v} %`} />
                <ColorSwatchGroup aria-label="Color del marco" value={color} onValueChange={setColor} colors={MATERIALS} />
              </Demo>
            </div>
            <Demo label="Opciones en tarjetas" className="block">
              <RadioCards
                aria-label="Cómo calcular el precio"
                value={marginMode}
                onValueChange={setMarginMode}
                options={[
                  { value: 'margin', title: 'Margen sobre venta', description: 'Precio = costo ÷ (1 − margen). Lo habitual.', icon: Layers, badge: <Badge tone="ink" size="sm">Recomendado</Badge> },
                  { value: 'markup', title: 'Recargo sobre costo', description: 'Precio = costo × (1 + recargo).', icon: Plus },
                ]}
              />
            </Demo>
          </Section>

          <Section id="estados" title="Estados y etiquetas">
            <Demo label="Estados de cotización">
              {QUOTE_STATUS_ORDER.map((s) => (
                <StatusPill key={s} status={s} />
              ))}
              <StatusPill status="sent" suffix="rev. B" />
            </Demo>
            <Demo label="Insignias">
              <Badge>Borrador</Badge>
              <Badge tone="ink">Pro</Badge>
              <Badge tone="ok" dot>
                Verificada
              </Badge>
              <Badge tone="warn" dot>
                Sin precio
              </Badge>
              <Badge tone="bad">No fabricable</Badge>
              <Badge tone="outline">PRO6004</Badge>
            </Demo>
            <Demo label="Personas">
              <Avatar name="Ana Pérez" tone="ink" size="lg" />
              <Avatar name="Rodrigo Muñoz" size="md" />
              <Avatar name="Camila" size="sm" />
              <Avatar name="Taller Sur" size="xs" />
            </Demo>
            <Demo label="Guardado automático">
              <SaveIndicator status={saveStatus} savedAt={new Date()} />
              <Button size="sm" onClick={() => setSaveStatus('saving')}>
                Simular cambio
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSaveStatus('offline')}>
                Sin conexión
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSaveStatus('error')}>
                Error
              </Button>
            </Demo>
            <Demo label="Indicadores (la cifra rueda y destella al cambiar)" className="grid gap-3 sm:grid-cols-3">
              <KPI label="Vendido este mes" value={kpi} format={formatCLP} delta={12.4} hint="8 cotizaciones aceptadas" />
              <KPI label="Tasa de cierre" value={38} format={(n) => `${Math.round(n)} %`} delta={-3} hint="Últimos 30 días" />
              <KPI label="En taller" value={5} hint="2 para esta semana" />
            </Demo>
            <div>
              <Button size="sm" onClick={() => setKpi((v) => v + 1_250_000)}>
                Sumar una venta
              </Button>{' '}
              <Flash trigger={kpi}>
                <span className="px-1 font-medium tabular">{formatCLP(kpi)}</span>
              </Flash>
            </div>
            <Demo label="Carga (bloques quietos, sin brillo)" className="grid gap-6 sm:grid-cols-2">
              <Card>
                <Skeleton className="mb-3 h-5 w-40" />
                <SkeletonText lines={3} />
              </Card>
              <Card padding="none">
                <SkeletonRows rows={3} columns={3} />
              </Card>
            </Demo>
            <Demo label="Vacío" className="block">
              <Card padding="none">
                <EmptyState
                  sketch="sliding"
                  title="Aquí quedarán tus cotizaciones"
                  description="Cada cotización se guarda sola mientras la armas."
                  action={
                    <Button variant="primary" icon={Plus} shortcut="c">
                      Nueva cotización
                    </Button>
                  }
                  secondary={<Button variant="ghost">Importar</Button>}
                />
              </Card>
            </Demo>
          </Section>

          <Section id="superficies" title="Superficies">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader title="V1 · Living" description="Corredera 2 hojas · PROSLD70 · Blanco" actions={<Badge tone="ok">Lista</Badge>} />
                <div className="mt-4 flex items-end justify-between">
                  <span className="text-paper-600 tabular">{formatSize(1800, 1300)}</span>
                  <span className="text-lead font-semibold tabular">{formatCLP(412_300)}</span>
                </div>
              </Card>
              <Card interactive>
                <CardHeader title="Tarjeta clicable" description="Resalta el borde al pasar el cursor." />
              </Card>
            </div>
            <Panel
              title="¿De dónde sale el precio?"
              description="Desglose de la V1"
              actions={<Button size="sm" variant="ghost">Ver detalle</Button>}
              footer={<span className="text-[13px] text-paper-600">Precios de lista con tus descuentos por marca.</span>}
            >
              <dl className="grid grid-cols-2 gap-y-2 text-base tabular">
                <dt className="text-paper-600">Perfiles</dt>
                <dd className="text-right">{formatCLP(96_420)}</dd>
                <dt className="text-paper-600">Vidrio DVH</dt>
                <dd className="text-right">{formatCLP(58_900)}</dd>
                <dt className="text-paper-600">Herrajes</dt>
                <dd className="text-right">{formatCLP(31_200)}</dd>
                <dt className="font-medium">Precio neto</dt>
                <dd className="text-right font-semibold">{formatCLP(412_300)}</dd>
              </dl>
            </Panel>
          </Section>

          <Section id="superposiciones" title="Superposiciones" description="Diálogos solo para lo irreversible; para todo lo demás, deshacer.">
            <Demo label="Diálogo, hojas y popover">
              <Dialog>
                <DialogTrigger asChild>
                  <Button icon={Send}>Enviar por correo</Button>
                </DialogTrigger>
                <DialogContent
                  title="¿Enviar la cotización N° 412?"
                  description="Le llegará a pedro@correo.cl con el enlace para aceptarla en línea."
                  footer={
                    <>
                      <DialogClose asChild>
                        <Button variant="ghost">Cancelar</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button variant="primary" onClick={() => toast.success('Enviada a pedro@correo.cl')}>
                          Enviar
                        </Button>
                      </DialogClose>
                    </>
                  }
                >
                  <p className="text-paper-600">Si después la editas, el cliente verá la revisión B automáticamente.</p>
                </DialogContent>
              </Dialog>
              <Sheet>
                <SheetTrigger asChild>
                  <Button>Hoja lateral</Button>
                </SheetTrigger>
                <SheetContent title="Nuevo cliente" description="Solo el nombre es necesario." footer={<Button variant="primary">Guardar</Button>}>
                  <div className="flex flex-col gap-4">
                    <Field label="Nombre">
                      <Input autoFocus placeholder="Pedro Pérez" />
                    </Field>
                    <Field label="Teléfono" optional>
                      <Input inputMode="tel" placeholder="+56 9 1234 5678" />
                    </Field>
                  </div>
                </SheetContent>
              </Sheet>
              <Sheet>
                <SheetTrigger asChild>
                  <Button>Hoja inferior</Button>
                </SheetTrigger>
                <SheetContent side="bottom" title="Agregar">
                  <div className="flex flex-col gap-1">
                    {[
                      { icon: AppWindow, label: 'Ventana' },
                      { icon: DoorOpen, label: 'Puerta' },
                      { icon: FilePlus2, label: 'Ítem manual' },
                    ].map((o) => (
                      <button key={o.label} type="button" className="flex h-12 items-center gap-3 rounded-sm px-3 text-left hover:bg-paper-100">
                        <o.icon aria-hidden strokeWidth={1.75} className="size-5 text-paper-600" />
                        {o.label}
                      </button>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
              <Popover>
                <PopoverTrigger asChild>
                  <Button>Popover</Button>
                </PopoverTrigger>
                <PopoverContent className="w-72">
                  <div className="flex flex-col gap-3">
                    <p className="font-medium">Editar cota</p>
                    <NumberField value={width} onChange={setWidth} min={200} max={6000} />
                  </div>
                </PopoverContent>
              </Popover>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton icon={MoreHorizontal} label="Más acciones" variant="secondary" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Cotización N° 412</DropdownMenuLabel>
                  <DropdownMenuItem icon={Copy} shortcut="d">
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem icon={Download}>Descargar PDF</DropdownMenuItem>
                  <DropdownMenuItem icon={Users}>Cambiar cliente</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={Trash2} danger onSelect={() => toastUndo('Borraste la cotización N° 412', () => toast('Recuperada'))}>
                    Borrar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip content="Ancho total exterior" shortcut="w">
                <Button variant="ghost">Tooltip</Button>
              </Tooltip>
            </Demo>
            <Demo label="Avisos">
              <Button onClick={() => toastUndo('Eliminaste la V3', () => toast('La V3 volvió a su lugar'))}>Con «Deshacer»</Button>
              <Button onClick={() => toast.success('Guardado')}>Éxito</Button>
              <Button onClick={() => toast.warning('El herraje X no tiene precio: se cotiza en $0')}>Aviso</Button>
              <Button onClick={() => toast.error('No pudimos conectar. Tus cambios están a salvo; reintentamos solos.')}>Error</Button>
            </Demo>
            <Demo label="Paleta de comandos">
              <Button icon={Search} shortcut="mod+k" onClick={() => setPaletteOpen(true)}>
                Abrir paleta
              </Button>
            </Demo>
            <CommandPalette
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              onAsk={(q) => toast(`Marco recibiría: «${q}»`)}
              groups={[
                {
                  heading: 'Acciones',
                  items: [
                    { id: 'new', label: 'Nueva cotización', icon: FilePlus2, shortcut: 'c', onSelect: () => toast('Nueva cotización') },
                    { id: 'client', label: 'Nuevo cliente', icon: Users, onSelect: () => toast('Nuevo cliente') },
                  ],
                },
                {
                  heading: 'Cotizaciones',
                  items: SAMPLE_QUOTES.map((q) => ({
                    id: q.id,
                    label: `N° ${q.number} · ${q.title}`,
                    hint: q.client,
                    icon: FileText,
                    onSelect: () => toast(`Abrir N° ${q.number}`),
                  })),
                },
              ]}
            />
          </Section>

          <Section
            id="tabla"
            title="Tabla de datos"
            description="Orden por columna, búsqueda tolerante a tildes, filtros que avisan lo oculto, selección con barra flotante, edición en línea (clic en obra o total) y sumas al pie. Cada columna tiene un ancho mínimo (minWidth; 200 px la principal): si no caben, se esconden primero las secundarias (hideBelow: xl → sm) y después la tabla se desplaza en horizontal. emptyFiltered permite un texto propio cuando los filtros no dejan filas."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Input icon={Search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" wrapperClassName="w-64" />
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
                className="w-44"
                aria-label="Filtrar por estado"
                options={[{ value: 'all', label: 'Todos los estados' }, ...QUOTE_STATUS_ORDER.map((s) => ({ value: s, label: <StatusPill status={s} /> }))]}
              />
              <div className="ml-auto flex items-center gap-1">
                <IconButton icon={Undo2} label="Deshacer edición" shortcut="mod+z" disabled={!quotes.canUndo} onClick={quotes.undo} />
              </div>
            </div>
            <DataTable
              caption="Cotizaciones de ejemplo"
              rows={quotes.value}
              columns={columns}
              getRowId={(q) => q.id}
              query={query}
              filter={statusFilter === 'all' ? undefined : (q) => q.status === statusFilter}
              onClearFilters={() => {
                setQuery('')
                setStatusFilter('all')
              }}
              defaultSort={{ id: 'number', dir: 'desc' }}
              selectable
              noun={['cotización', 'cotizaciones']}
              bulkActions={(rows, clear) => (
                <>
                  <Button size="sm" variant="ghost" icon={Copy} onClick={() => toast(`Duplicarías ${rows.length}`)}>
                    Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    onClick={() => {
                      const ids = new Set(rows.map((r) => r.id))
                      quotes.set((list) => list.filter((q) => !ids.has(q.id)))
                      clear()
                      toastUndo(rows.length === 1 ? 'Borraste 1 cotización' : `Borraste ${rows.length} cotizaciones`, quotes.undo)
                    }}
                  >
                    Borrar
                  </Button>
                </>
              )}
            />
          </Section>

          <Section id="plan" title="Límites de plan" description="Lo que no incluye el plan se ve, se explica y ofrece mejorar. Nunca un muro.">
            <PlanGate feature="purchasing" allowed={false} dismissible>
              <Card>
                <CardHeader title="Orden de compra · Proline" description="12 líneas · 38 barras" />
                <SkeletonText lines={3} className="mt-4" />
              </Card>
            </PlanGate>
            <PlanGate feature="stations" allowed={false} variant="inline" />
          </Section>

          <Section id="dibujos" title="Dibujos de trazo fino" description="Para vacíos y acceso: la ventana dibujada es la protagonista, con la convención del rubro.">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {sketches.map((s) => (
                <Card key={s.kind} className="flex flex-col items-center gap-3">
                  <WindowSketch kind={s.kind} size={110} />
                  <span className="text-[13px] text-paper-600">{s.label}</span>
                </Card>
              ))}
            </div>
            <Card className="flex justify-center py-8">
              <WindowSketch kind="sliding" width={1800} height={1300} dimensions size={260} />
            </Card>
          </Section>
        </main>
      </div>
    </div>
  )
}
