/**
 * /dev/ui — vitrina del sistema de diseño «Huincha»: marca, tokens, tipografía y todos los
 * componentes base en claro y oscuro. Sin sesión ni servidor. Los datos son de ejemplo (ficticios).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  ArrowUpRight,
  Copy,
  Download,
  FilePlus2,
  Layers,
  Maximize2,
  Minus,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Redo2,
  Search,
  Send,
  SlidersHorizontal,
  Sun,
  Ruler,
  SunMoon,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react'
import type { QuoteStatus } from '@dekopen/shared'
import { formatArea, formatCLP, formatSize } from '../../lib/format'
import { useTheme } from '../../lib/theme'
import { usePageTitle } from '../../lib/usePageTitle'
import { cn } from '../../lib/cn'
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
  DekopenLogo,
  DekopenMark,
  DekopenWordmark,
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
  IconButton,
  Input,
  Inspector,
  InspectorFooter,
  InspectorHeader,
  InspectorRow,
  InspectorSection,
  Kbd,
  KbdHint,
  KPI,
  Meter,
  MoneyField,
  Notice,
  NumberField,
  Numeric,
  PageHeader,
  PageSection,
  RowTitle,
  StatStrip,
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
  Spinner,
  StatusDot,
  StatusPill,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
  toastUndo,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarSpacer,
  ToolbarTitle,
  Tooltip,
  WindowSketch,
  type ComboboxOption,
  type DataTableColumn,
  type SaveStatus,
  type SketchKind,
} from '../../ui'
import {
  DEKOPEN_ICONS,
  IconOpeningCasement,
  IconOpeningFixed,
  IconOpeningSliding,
  IconOpeningTiltTurn,
} from '../../ui/icons'

const SECTIONS = [
  ['marco', 'Marco y hoja'],
  ['marca', 'Marca'],
  ['color', 'Color'],
  ['tipografia', 'Tipografía y cifras'],
  ['botones', 'Botones'],
  ['campos', 'Campos'],
  ['seleccion', 'Selección'],
  ['estados', 'Estados y avisos'],
  ['superficies', 'Superficies'],
  ['inspector', 'Inspector y barra'],
  ['tabla', 'Tabla de datos'],
  ['superposiciones', 'Superposiciones'],
  ['comparar', 'Claro y oscuro'],
  ['iconos', 'Íconos del rubro'],
  ['dibujos', 'Dibujos de trazo fino'],
] as const

// ── Datos de ejemplo (ficticios) ──────────────────────────────────────────────────────────

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
  { id: 'q1', number: 184, title: 'Casa Fuentes · ampliación', client: 'Marcela Fuentes', status: 'sent', units: 4, area: 5.73, total: 928_200, updated: 'hace 2 h' },
  { id: 'q2', number: 183, title: 'Edificio Los Aromos, depto. 504', client: 'Inmobiliaria Austral', status: 'accepted', units: 12, area: 18.4, total: 3_412_900, updated: 'ayer' },
  { id: 'q3', number: 182, title: 'Quincho y terraza', client: 'Jorge Contreras', status: 'draft', units: 3, area: 7.2, total: 1_204_000, updated: 'hace 3 días' },
  { id: 'q4', number: 181, title: 'Oficina Barrio Italia', client: 'Estudio Norte', status: 'workshop', units: 8, area: 11.9, total: 2_310_500, updated: 'hace 4 días' },
  { id: 'q5', number: 180, title: 'Cambio de ventanas dormitorios', client: 'Paula Riquelme', status: 'installed', units: 5, area: 6.1, total: 1_096_300, updated: 'hace 1 sem.' },
  { id: 'q6', number: 179, title: 'Local comercial Av. Matta', client: 'Ferretería San José', status: 'rejected', units: 2, area: 9.8, total: 1_870_000, updated: 'hace 2 sem.' },
  { id: 'q7', number: 178, title: 'Casa Peñalolén', client: 'Rodrigo Saavedra', status: 'closed', units: 6, area: 8.4, total: 1_512_700, updated: 'hace 1 mes' },
]

const CLIENT_OPTIONS: ComboboxOption[] = [
  { value: 'c1', label: 'Marcela Fuentes', hint: 'Ñuñoa' },
  { value: 'c2', label: 'Inmobiliaria Austral', hint: 'Concepción' },
  { value: 'c3', label: 'Estudio Norte', hint: 'Providencia' },
  { value: 'c4', label: 'Jorge Contreras', hint: 'Puerto Varas' },
]

const COLORS = [
  { id: 'white', name: 'Blanco', hex: '#F6F5F1' },
  { id: 'anthracite', name: 'Antracita 7016', hex: '#383E42' },
  { id: 'black', name: 'Negro', hex: '#0E0E10' },
  { id: 'oak', name: 'Roble dorado', hex: '#A8692E' },
  { id: 'walnut', name: 'Nogal', hex: '#5B3A22' },
  { id: 'winchester', name: 'Winchester', hex: '#7A4A2A' },
]

// ── Andamiaje de la vitrina ───────────────────────────────────────────────────────────────

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t border-divider py-12 first:border-t-0 first:pt-2">
      <div className="mb-6 max-w-2xl">
        <h2 id={`${id}-h`} className="text-h3 font-semibold text-fg-strong">
          {title}
        </h2>
        {description ? <p className="mt-1 text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Demo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="text-meta font-medium text-fg-muted">{label}</div>
      {children}
    </div>
  )
}

function Swatch({ token, label, className }: { token: string; label: string; className?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={cn('size-9 shrink-0 rounded-sm border border-divider', className)} style={{ background: `var(${token})` }} />
      <div className="min-w-0">
        <div className="truncate text-table font-medium text-fg">{label}</div>
        <div className="code-id truncate text-micro text-fg-muted">{token}</div>
      </div>
    </div>
  )
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  return (
    <SegmentedControl
      aria-label="Tema"
      size="sm"
      value={theme}
      onValueChange={setTheme}
      options={[
        { value: 'original', label: 'Original', icon: Ruler },
        { value: 'light', label: 'Blanco', icon: Sun },
        { value: 'dark', label: 'Oscuro', icon: Moon },
        { value: 'system', label: 'Sistema', icon: SunMoon },
      ]}
    />
  )
}

/** Muestra compacta de componentes para comparar los dos temas lado a lado. */
function Sampler() {
  const [seg, setSeg] = useState<'design' | 'document'>('design')
  const [on, setOn] = useState(true)
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-divider bg-canvas p-5 text-fg">
      <div className="flex items-center justify-between">
        <DekopenLogo size="sm" />
        <SegmentedControl
          aria-label="Vista"
          size="sm"
          value={seg}
          onValueChange={setSeg}
          options={[
            { value: 'design', label: 'Diseño' },
            { value: 'document', label: 'Documento' },
          ]}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={Send}>
          Enviar al cliente
        </Button>
        <Button icon={Copy}>Duplicar</Button>
        <Button variant="ghost">Cancelar</Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ancho">
          <NumberField value={1200} onChange={() => {}} />
        </Field>
        <Field label="Alto" error="Máximo 2.400 mm para esta línea.">
          <NumberField value={2600} onChange={() => {}} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {QUOTE_STATUS_ORDER.map((s) => (
          <StatusPill key={s} status={s} />
        ))}
      </div>
      <Card padding="sm" className="flex items-center gap-3">
        <WindowSketch kind="sliding" size={44} />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-fg-strong">V1 · Living</div>
          <div className="dim truncate text-table text-fg-muted">Corredera 2 hojas · 1.200 × 1.000 mm</div>
        </div>
        <Numeric size="base" className="font-semibold">
          {formatCLP(370_000)}
        </Numeric>
      </Card>
      <div className="flex items-center justify-between gap-4">
        <Switch checked={on} onCheckedChange={setOn} label="Incluir instalación" />
        <Meter value={1240} max={2000} valueLabel="1.240 / 2.000" className="w-40" />
      </div>
      <Notice tone="warning" size="compact">
        Falta el precio del vidrio laminado en esta línea.
      </Notice>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────────────────

export default function UiShowcase() {
  usePageTitle('Sistema de diseño')

  const [width, setWidth] = useState<number | null>(1200)
  const [height, setHeight] = useState<number | null>(1000)
  const [price, setPrice] = useState<number | null>(185_000)
  const [line, setLine] = useState<string>('pro70')
  const [clients, setClients] = useState(CLIENT_OPTIONS)
  const [client, setClient] = useState<string | undefined>('c1')
  const [notes, setNotes] = useState('Instalar con tapajuntas por fuera.')

  const [view, setView] = useState<'design' | 'document'>('design')
  const [install, setInstall] = useState(true)
  const [showArea, setShowArea] = useState(false)
  const [marginMode, setMarginMode] = useState<'margin' | 'markup'>('margin')
  const [margin, setMargin] = useState(35)
  const [color, setColor] = useState('white')
  const [opening, setOpening] = useState('tilt_turn')

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [qty, setQty] = useState(2)

  const [paletteOpen, setPaletteOpen] = useState(false)

  const [rows, setRows] = useState<SampleQuote[]>(SAMPLE_QUOTES)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | QuoteStatus>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (saveStatus !== 'saving') return
    const t = setTimeout(() => setSaveStatus('saved'), 900)
    return () => clearTimeout(t)
  }, [saveStatus])

  const unit = 185_000
  const total = unit * qty

  const columns = useMemo<DataTableColumn<SampleQuote>[]>(
    () => [
      { id: 'number', header: 'N°', value: (q) => q.number, width: 72, cell: (q) => <span className="code-id text-fg-muted">{q.number}</span> },
      {
        id: 'title',
        header: 'Obra',
        value: (q) => q.title,
        cell: (q) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex w-9 shrink-0 justify-center">
              <WindowSketch kind={q.units > 6 ? 'triple' : q.units > 3 ? 'sliding' : 'casement'} size={22} />
            </span>
            <span className="truncate font-medium text-fg-strong">{q.title}</span>
          </div>
        ),
        edit: {
          type: 'text',
          label: (q) => `Editar nombre de la obra ${q.number}`,
          onCommit: (row, value) => setRows((list) => list.map((q) => (q.id === row.id ? { ...q, title: String(value ?? '') } : q))),
        },
      },
      { id: 'client', header: 'Cliente', value: (q) => q.client, hideBelow: 'md', minWidth: 160 },
      { id: 'status', header: 'Estado', value: (q) => q.status, cell: (q) => <StatusPill status={q.status} />, width: 128 },
      { id: 'units', header: 'Unid.', value: (q) => q.units, align: 'right', width: 72, footer: 'sum', hideBelow: 'lg' },
      { id: 'area', header: 'm²', value: (q) => q.area, align: 'right', width: 92, footer: 'sum', format: formatArea, hideBelow: 'lg' },
      { id: 'total', header: 'Total neto', value: (q) => q.total, align: 'right', width: 136, footer: 'sum', format: formatCLP },
      { id: 'updated', header: 'Editada', value: (q) => q.updated, width: 116, hideBelow: 'xl', cell: (q) => <span className="text-fg-muted">{q.updated}</span> },
    ],
    [],
  )

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      {/* Barra superior */}
      <header className="sticky top-0 z-30 border-b border-divider bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-6">
          <Link to="/" aria-label="Inicio" className="rounded-xs">
            <DekopenLogo size="sm" />
          </Link>
          <span aria-hidden className="h-5 w-px bg-divider" />
          <span className="text-table text-fg-muted">
            Sistema de diseño · <span className="font-medium text-fg">Huincha</span>
          </span>
          <div className="ml-auto flex items-center gap-3">
            <SaveIndicator status={saveStatus} />
            <Button size="sm" variant="ghost" icon={Search} shortcut="mod+k" onClick={() => setPaletteOpen(true)}>
              Buscar
            </Button>
            <ThemeSwitch />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-10 px-6">
        <nav aria-label="Secciones" className="sticky top-14 hidden h-[calc(100dvh-56px)] w-48 shrink-0 overflow-y-auto py-10 lg:block">
          <ul className="flex flex-col gap-0.5">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="flex h-8 items-center rounded-sm px-2.5 text-table text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 py-10">
          <PageHeader
            breadcrumbs={[{ label: 'Desarrollo', to: '/dev/ui' }, { label: 'Componentes' }]}
            title="Huincha"
            description="Una hoja blanca dentro de un marco quieto, tinta para todo lo que está activo y el amarillo de la huincha solo para la acción principal. Funnel Sans en la interfaz, Funnel Display en títulos y cifras."
            meta={
              <>
                <Badge tone="accent">v3</Badge>
                <span>Tokens en styles.css · Guía en docs/DESIGN.md</span>
              </>
            }
          />

          {/* ── Marco y hoja ── */}
          <Section id="marco" title="Marco y hoja" description="La app es el marco; el trabajo va en una hoja con radio 16. Sin tarjetas por defecto: secciones con aire, cifras sueltas y filas de dos líneas.">
            <div className="overflow-hidden rounded-lg bg-frame p-2 pl-0">
              <div className="flex gap-2">
                <div className="flex w-44 shrink-0 flex-col gap-0.5 px-2 pt-1">
                  <div className="mb-2 px-2 pt-1 text-fg-muted">
                    <DekopenLogo size="sm" />
                  </div>
                  <span className="flex h-8 items-center rounded-sm bg-surface px-2 font-medium text-fg-strong shadow-raised">Cotizaciones</span>
                  <span className="flex h-8 items-center rounded-sm px-2 text-fg">Clientes</span>
                  <span className="flex h-8 items-center rounded-sm px-2 text-fg">Taller</span>
                </div>
                <div className="min-w-0 flex-1 rounded-lg bg-canvas p-6 shadow-raised">
                  <PageSection
                    title="Por seguir"
                    description="Enviadas hace más de 3 días."
                    actions={
                      <Button size="sm" iconRight={ArrowUpRight}>
                        Ver todas
                      </Button>
                    }
                  >
                    <StatStrip className="mb-5">
                      <KPI variant="plain" label="Por seguir" value="4" hint="$3.420.000" />
                      <KPI variant="plain" label="Aceptado" value={formatCLP(8_120_000)} hint="este mes" />
                      <KPI variant="plain" label="En taller" value="7" hint="2 vencen esta semana" />
                    </StatStrip>
                    <RowTitle media={<WindowSketch kind="sliding" size={40} className="text-fg-faint" />} title="Casa Fuentes" subtitle="Marcela Fuentes · Ñuñoa" />
                  </PageSection>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Marca ── */}
          <Section id="marca" title="Marca" description="Marca «Hoja abierta»: la jamba fija y la hoja que abre. Va en tinta sobre la placa amarilla o a una sola tinta. El logotipo es Funnel Display en trazados.">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex min-h-48 flex-col items-start justify-between gap-8 rounded-lg border border-divider bg-surface p-8">
                <DekopenLogo size="lg" />
                <div className="flex items-end gap-6 text-fg">
                  {[16, 20, 24, 32, 48].map((s) => (
                    <div key={s} className="flex flex-col items-center gap-2">
                      <DekopenMark size={s} tone="mono" />
                      <span className="code-id text-micro text-fg-muted">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div data-theme="dark" className="flex min-h-48 flex-col items-start justify-between gap-8 rounded-lg border border-divider bg-canvas p-8 text-fg">
                <DekopenLogo size="lg" />
                <div className="flex items-end gap-4">
                  {[16, 32, 64].map((s) => (
                    <DekopenMark key={s} size={s} title={`Ícono de la app ${s}px`} />
                  ))}
                  <DekopenMark size={40} tone="mono" className="text-fg" />
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-8 rounded-lg border border-divider bg-surface px-8 py-6 text-fg">
              <DekopenWordmark height={40} />
              <DekopenWordmark height={20} className="text-fg-muted" />
              <DekopenLogo size="md" />
              <DekopenLogo size="sm" tone="mono" />
            </div>
          </Section>

          {/* ── Color ── */}
          <Section id="color" title="Color" description="Casi todo es tinta y blanco. La señal amarilla es la acción principal de la vista y nada más: nunca texto, borde ni fondo. El azul de selección vive solo dentro del lienzo.">
            <div className="grid gap-8 lg:grid-cols-2">
              <Demo label="Superficies">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Swatch token="--dk-frame" label="Marco" />
                  <Swatch token="--dk-canvas" label="Hoja" />
                  <Swatch token="--dk-surface" label="Superficie" />
                  <Swatch token="--dk-sunken" label="Hundida" />
                  <Swatch token="--dk-raised" label="Elevada" />
                  <Swatch token="--dk-hover" label="Hover" />
                  <Swatch token="--dk-inverse" label="Inversa" />
                </div>
              </Demo>
              <Demo label="Texto y bordes">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Swatch token="--dk-fg-strong" label="Texto fuerte" />
                  <Swatch token="--dk-fg" label="Texto" />
                  <Swatch token="--dk-fg-muted" label="Atenuado" />
                  <Swatch token="--dk-fg-faint" label="Tenue" />
                  <Swatch token="--dk-divider" label="Divisor" />
                  <Swatch token="--dk-control" label="Borde de control" />
                </div>
              </Demo>
              <Demo label="Señal, tinta y selección">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Swatch token="--dk-signal" label="Señal" />
                  <Swatch token="--dk-signal-hover" label="Señal hover" />
                  <Swatch token="--dk-accent" label="Tinta (accent)" />
                  <Swatch token="--dk-accent-subtle" label="Tono seleccionado" />
                  <Swatch token="--dk-focus" label="Foco" />
                  <Swatch token="--dk-select" label="Selección del lienzo" />
                </div>
              </Demo>
              <Demo label="Estados (tinta · fondo)">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Swatch token="--dk-success" label="Éxito" />
                  <Swatch token="--dk-warning" label="Aviso" />
                  <Swatch token="--dk-danger" label="Peligro" />
                  <Swatch token="--dk-info" label="Información" />
                  <Swatch token="--dk-success-bg" label="Éxito fondo" />
                  <Swatch token="--dk-warning-bg" label="Aviso fondo" />
                  <Swatch token="--dk-danger-bg" label="Peligro fondo" />
                  <Swatch token="--dk-info-bg" label="Info fondo" />
                </div>
              </Demo>
              <Demo label="Gráficos">
                <div className="flex h-24 items-end gap-2 rounded-md border border-divider bg-surface p-4">
                  {[0.55, 0.8, 0.4, 0.65, 0.3, 0.5].map((h, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                      <div className="w-full rounded-t-[3px]" style={{ height: `${h * 52}px`, background: `var(--dk-chart-${i + 1})` }} />
                      <span className="code-id text-micro text-fg-muted">{i + 1}</span>
                    </div>
                  ))}
                </div>
              </Demo>
              <Demo label="Materiales (fijos, datos del producto)">
                <div className="flex flex-wrap items-center gap-4">
                  {COLORS.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <ColorSwatch hex={c.hex} size="lg" name={c.name} />
                      <span className="text-table text-fg">{c.name}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <span className="size-8 rounded-xs border border-divider bg-glass" />
                    <span className="text-table text-fg">Vidrio</span>
                  </div>
                </div>
              </Demo>
            </div>
          </Section>

          {/* ── Tipografía ── */}
          <Section id="tipografia" title="Tipografía y cifras" description="Pesos 400 / 500 / 600. Títulos en 500. Las mayúsculas solo para identificadores y el logotipo. Montos a la derecha con cifras tabulares; sin monoespaciada.">
            <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
              <div className="flex flex-col gap-4">
                <p className="text-display-sm font-semibold text-fg-strong">Cotiza ventanas con cada detalle resuelto.</p>
                <p className="text-h1 font-semibold text-fg-strong">Cotizaciones · h1 26/32</p>
                <p className="text-h2 font-semibold text-fg-strong">Casa Fuentes · h2 22/28</p>
                <p className="text-h3 font-semibold text-fg-strong">Enviar la cotización · h3 18/24</p>
                <p className="text-h4 font-semibold text-fg-strong">Medidas y apertura · h4 16/22</p>
                <p className="text-base text-fg">
                  Texto base 14/20. Medidas, materiales y precios en una propuesta clara para tu cliente — ñandú, açaí, Straße, İstanbul, kapı, Ğ ş.
                </p>
                <p className="text-table text-fg-muted">Secundario 13/18 · encabezados de tabla, ayudas y metadatos.</p>
                <p className="text-meta text-fg-muted">Meta 12/16 · anotaciones técnicas mínimas.</p>
              </div>
              <Card padding="lg" className="flex flex-col gap-4">
                <InspectorRow label="Monto">
                  <Numeric>{formatCLP(928_200)}</Numeric>
                </InspectorRow>
                <InspectorRow label="Medida" kind="mono">
                  {formatSize(1200, 1000)}
                </InspectorRow>
                <InspectorRow label="Superficie" kind="mono">
                  {formatArea(1.2)}
                </InspectorRow>
                <InspectorRow label="Código">
                  <Numeric kind="id">PRO-70 · Q-2026-0184</Numeric>
                </InspectorRow>
                <div className="flex items-baseline justify-between border-t border-divider pt-4">
                  <span className="text-table text-fg-muted">Total con IVA</span>
                  <Numeric size="total">{formatCLP(928_200)}</Numeric>
                </div>
                <p className="dim text-table text-fg-muted">1.249,5 mm · 2.384.900 · 0123456789</p>
              </Card>
            </div>
          </Section>

          {/* ── Botones ── */}
          <Section id="botones" title="Botones" description="36 px en escritorio, 44 en táctil. Una sola primaria por vista. Al presionar se escala 0,97 y al cargar conserva el ancho; foco = aro de tinta separado 2 px.">
            <div className="flex flex-col gap-8">
              <Demo label="Variantes">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" icon={Send} shortcut="mod+enter">
                    Enviar al cliente
                  </Button>
                  <Button variant="ink" icon={Send}>
                    Aceptar cotización
                  </Button>
                  <Button icon={FilePlus2}>Nueva cotización</Button>
                  <Button variant="subtle" icon={Plus}>
                    Agregar ventana
                  </Button>
                  <Button variant="ghost" icon={Pencil}>
                    Editar
                  </Button>
                  <Button variant="danger" icon={Trash2}>
                    Eliminar definitivamente
                  </Button>
                </div>
              </Demo>
              <Demo label="Tamaños · xs 26 · sm 30 · md 36 · lg 44">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="xs">Extra chico</Button>
                  <Button size="sm">Chico</Button>
                  <Button size="md">Mediano</Button>
                  <Button size="lg" variant="primary" iconRight={ArrowUpRight}>
                    Probar con una ventana
                  </Button>
                </div>
              </Demo>
              <Demo label="Estados">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" loading>
                    Generando PDF
                  </Button>
                  <Button loading>Guardando</Button>
                  <Button variant="primary" disabled>
                    Sin ventanas
                  </Button>
                  <Button disabled>Deshabilitado</Button>
                </div>
              </Demo>
              <Demo label="Íconos y teclas">
                <div className="flex flex-wrap items-center gap-2">
                  <IconButton icon={Undo2} label="Deshacer" shortcut="mod+z" />
                  <IconButton icon={Redo2} label="Rehacer" shortcut="mod+shift+z" />
                  <IconButton icon={Copy} label="Duplicar" variant="secondary" />
                  <IconButton icon={Plus} label="Agregar" variant="primary" />
                  <IconButton icon={MoreHorizontal} label="Más acciones" size="sm" />
                  <IconButton icon={Layers} label="Capas" size="sm" aria-pressed />
                  <span className="mx-2 h-6 w-px bg-divider" />
                  <Kbd combo="mod+k" />
                  <Kbd combo="shift+enter" />
                  <KbdHint combo="mod+j">abrir el asistente</KbdHint>
                </div>
              </Demo>
            </div>
          </Section>

          {/* ── Campos ── */}
          <Section id="campos" title="Campos" description="Borde de control con contraste 3:1; foco con borde de tinta y aro suave; errores que dicen qué pasó y cómo seguir.">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Nombre de la obra" hint="Así aparece en la propuesta.">
                <Input defaultValue="Casa Fuentes · ampliación" />
              </Field>
              <Field label="Buscar">
                <Input icon={Search} placeholder="Cliente, obra o N°" />
              </Field>
              <Field label="Correo" error="Falta la @. Revisa el correo y vuelve a intentarlo.">
                <Input defaultValue="marcela.fuentes.gmail.com" />
              </Field>
              <Field label="Ancho" hint="Acepta 1200, 1,2 m o 1200x1000.">
                <NumberField value={width} onChange={setWidth} onSizeInput={(s) => (setWidth(s.width), setHeight(s.height))} min={300} max={3000} />
              </Field>
              <Field label="Alto">
                <NumberField value={height} onChange={setHeight} min={300} max={2600} />
              </Field>
              <Field label="Precio unitario" aside={<span className="tabular">+ IVA</span>}>
                <MoneyField value={price} onChange={setPrice} />
              </Field>
              <Field label="Línea">
                <Select
                  value={line}
                  onValueChange={setLine}
                  options={[
                    { value: 'pro70', label: 'PRO 70 · 5 cámaras', description: 'Abatibles y oscilobatientes', leading: <ColorSwatch hex="#F6F5F1" size="sm" /> },
                    { value: 'slide80', label: 'Slide 80 · corredera', leading: <ColorSwatch hex="#383E42" size="sm" /> },
                    { value: 'hst', label: 'HST elevable', disabled: true },
                  ]}
                />
              </Field>
              <Field label="Cliente">
                <Combobox
                  value={client}
                  onChange={setClient}
                  options={clients}
                  clearable
                  onCreate={(name) => {
                    const id = `c${clients.length + 1}`
                    setClients((list) => [...list, { value: id, label: name }])
                    setClient(id)
                  }}
                />
              </Field>
              <Field label="Deshabilitado">
                <Input disabled defaultValue="Antracita 7016 (bloqueado por la línea)" />
              </Field>
              <Field label="Notas para el taller" optional className="sm:col-span-2">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <Field label="Medida grande (editor)">
                <NumberField size="lg" value={width} onChange={setWidth} />
              </Field>
            </div>
          </Section>

          {/* ── Selección ── */}
          <Section id="seleccion" title="Selección">
            <div className="grid gap-8 lg:grid-cols-2">
              <Demo label="Control segmentado">
                <div className="flex flex-wrap items-center gap-3">
                  <SegmentedControl
                    aria-label="Vista"
                    value={view}
                    onValueChange={setView}
                    options={[
                      { value: 'design', label: 'Diseño' },
                      { value: 'document', label: 'Documento' },
                    ]}
                  />
                  <SegmentedControl
                    aria-label="Margen"
                    size="sm"
                    value={marginMode}
                    onValueChange={setMarginMode}
                    options={[
                      { value: 'margin', label: 'Margen' },
                      { value: 'markup', label: 'Recargo' },
                    ]}
                  />
                </div>
              </Demo>
              <Demo label="Interruptores y casillas">
                <div className="flex flex-col gap-3">
                  <Switch checked={install} onCheckedChange={setInstall} label="Incluir instalación" description="Se suma como línea aparte en la propuesta." />
                  <Checkbox checked={showArea} onCheckedChange={(v) => setShowArea(v === true)} label="Mostrar m² en el documento" />
                  <Checkbox checked="indeterminate" label="Seleccionar todas (parcial)" />
                  <Checkbox disabled label="Deshabilitada" />
                </div>
              </Demo>
              <Demo label="Tarjetas de opción (tipologías)" className="lg:col-span-2">
                <RadioCards
                  aria-label="Apertura"
                  columns={4}
                  value={opening}
                  onValueChange={setOpening}
                  options={[
                    { value: 'fixed', title: 'Paño fijo', description: 'Sin hoja', icon: IconOpeningFixed },
                    { value: 'casement', title: 'Abatible', description: 'Bisagras laterales', icon: IconOpeningCasement },
                    { value: 'tilt_turn', title: 'Oscilobatiente', description: 'Abre y bascula', icon: IconOpeningTiltTurn, badge: <Badge tone="accent" size="sm">Más usada</Badge> },
                    { value: 'sliding', title: 'Corredera', description: '2 a 6 hojas', icon: IconOpeningSliding },
                  ]}
                />
              </Demo>
              <Demo label="Pestañas · línea y píldora">
                <Tabs defaultValue="cuts">
                  <TabsList>
                    <TabsTrigger value="summary">Resumen</TabsTrigger>
                    <TabsTrigger value="cuts" badge={38}>
                      Cortes
                    </TabsTrigger>
                    <TabsTrigger value="glass" badge={6}>
                      Vidrios
                    </TabsTrigger>
                    <TabsTrigger value="cnc" disabled>
                      CNC
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="cuts" className="text-table text-fg-muted">
                    38 cortes en 9 barras de 6.000 mm · despunte 4,1 %.
                  </TabsContent>
                </Tabs>
                <Tabs defaultValue="medidas">
                  <TabsList variant="pill" className="w-fit">
                    <TabsTrigger value="medidas">Medidas</TabsTrigger>
                    <TabsTrigger value="acabado">Acabado</TabsTrigger>
                    <TabsTrigger value="extras">Extras</TabsTrigger>
                  </TabsList>
                </Tabs>
              </Demo>
              <Demo label="Deslizador y colores">
                <Slider value={margin} onValueChange={setMargin} max={80} format={(v) => `${v} %`} aria-label="Margen" />
                <ColorSwatchGroup aria-label="Color del marco" value={color} onValueChange={setColor} colors={COLORS} size="lg" />
              </Demo>
            </div>
          </Section>

          {/* ── Estados ── */}
          <Section id="estados" title="Estados y avisos" description="Estados escritos, color solo donde hay una decisión. Avisos en el sitio, nunca bloqueos.">
            <div className="grid gap-8 lg:grid-cols-2">
              <Demo label="Estados de cotización">
                <div className="flex flex-wrap gap-2">
                  {QUOTE_STATUS_ORDER.map((s) => (
                    <StatusPill key={s} status={s} />
                  ))}
                  <StatusPill status="sent" suffix="versión B" />
                </div>
              </Demo>
              <Demo label="Etiquetas">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Neutral</Badge>
                  <Badge tone="accent">Pro</Badge>
                  <Badge tone="ok" dot>
                    Lista
                  </Badge>
                  <Badge tone="warn" dot>
                    Falta precio
                  </Badge>
                  <Badge tone="bad">Vencida</Badge>
                  <Badge tone="info">Nuevo</Badge>
                  <Badge tone="okStrong">Pagada</Badge>
                  <Badge tone="outline" size="sm">
                    PRO-70
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <StatusDot tone="success">Sincronizado</StatusDot>
                  <StatusDot tone="accent" pulse>
                    Escuchando
                  </StatusDot>
                  <StatusDot tone="warning">Precio desactualizado</StatusDot>
                  <StatusDot>Sin actividad</StatusDot>
                </div>
              </Demo>
              <Demo label="Avisos en línea" className="lg:col-span-2">
                <div className="grid items-start gap-3 md:grid-cols-2">
                  <Notice tone="warning" title="Falta el precio del vidrio laminado 6+6" action={<Button size="sm">Completar</Button>}>
                    El total no incluye 2 vidrios. Complétalo en Catálogo › Vidrios.
                  </Notice>
                  <Notice tone="info" title="Precios actualizados">
                    El catálogo cambió desde que enviaste la versión A. Puedes recalcular o mantener los precios.
                  </Notice>
                  <Notice tone="success">Cotización aceptada por Marcela Fuentes hoy a las 10:24.</Notice>
                  <Notice tone="danger" title="No pudimos enviar el correo" action={<Button size="sm" variant="ghost">Reintentar</Button>}>
                    Tus cambios están a salvo.
                  </Notice>
                </div>
              </Demo>
              <Demo label="Medidores">
                <Meter label="Créditos de IA del mes" value={1240} max={2000} valueLabel="1.240 de 2.000" tone="auto" />
                <Meter label="Prueba Pro" value={11} max={14} valueLabel="quedan 3 días" tone="auto" size="md" />
                <Meter label="Catálogo listo para cotizar" value={7} max={9} valueLabel="7 de 9" tone="success" />
              </Demo>
              <Demo label="Guardado, carga y trabajo">
                <div className="flex flex-wrap items-center gap-4">
                  {(['saving', 'saved', 'offline', 'error'] as const).map((s) => (
                    <SaveIndicator key={s} status={s} />
                  ))}
                  <Spinner className="text-fg-muted" />
                  <Button size="sm" onClick={() => setSaveStatus('saving')}>
                    Simular guardado
                  </Button>
                </div>
                <div className="grid grid-cols-[48px_1fr] items-center gap-3 rounded-md border border-divider bg-surface p-3">
                  <Skeleton className="size-12" />
                  <SkeletonText lines={2} />
                </div>
              </Demo>
              <Demo label="Vacío (primera vez)" className="lg:col-span-2">
                <Card padding="none">
                  <EmptyState
                    sketch="sliding"
                    title="Aquí quedarán tus cotizaciones"
                    description="Crea la primera: elige una tipología, escribe las medidas y el precio aparece al instante."
                    action={
                      <Button variant="primary" icon={Plus} shortcut="n">
                        Nueva cotización
                      </Button>
                    }
                    secondary={<Button variant="ghost">Ver un ejemplo</Button>}
                  />
                </Card>
              </Demo>
            </div>
          </Section>

          {/* ── Superficies ── */}
          <Section id="superficies" title="Superficies" description="Reposo sin sombra; borde fino. Las sombras son solo para lo que flota.">
            <div className="flex flex-col gap-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KPI label="Cotizado este mes" value={18_420_000} format={formatCLP} delta={12.4} hint="34 cotizaciones" />
                <KPI label="Aceptado" value={7_310_500} format={formatCLP} delta={-3.1} hint="tasa 39,7 %" />
                <KPI label="Por seguir" value={9} hint="enviadas hace más de 3 días" />
                <KPI label="En taller" value={4} hint="2 para esta semana" />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader title="V1 · Living" description="Corredera 2 hojas · Slide 80 · Blanco" actions={<Badge tone="ok" dot>Lista</Badge>} />
                  <div className="mt-4 flex items-end justify-between">
                    <WindowSketch kind="sliding" size={72} width={1200} height={1000} />
                    <div className="text-right">
                      <div className="dim text-table text-fg-muted">1.200 × 1.000 mm · 2 u.</div>
                      <Numeric size="lg">{formatCLP(370_000)}</Numeric>
                    </div>
                  </div>
                </Card>
                <Card interactive tabIndex={0}>
                  <CardHeader title="Tarjeta clicable" description="Borde y sombra leve al pasar el cursor; foco visible." />
                </Card>
                <Card selected>
                  <CardHeader title="Tarjeta seleccionada" description="Borde de acento de 2 px." />
                </Card>
              </div>
              <Panel
                title="¿De dónde sale el precio?"
                description="Desglose de la V1 calculado por el motor."
                actions={<IconButton icon={Maximize2} label="Ampliar" size="sm" />}
                footer="Precios netos del catálogo «Lista 2026». IVA 19 % al final."
              >
                <div className="flex flex-col gap-2 text-base">
                  {[
                    ['Perfiles (6,4 m)', 98_400],
                    ['Vidrio DVH 4/12/4 (1,1 m²)', 42_300],
                    ['Herrajes y accesorios', 21_900],
                    ['Mano de obra', 22_400],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-baseline justify-between gap-4">
                      <span className="text-fg-muted">{label}</span>
                      <Numeric>{formatCLP(value as number)}</Numeric>
                    </div>
                  ))}
                  <div className="mt-1 flex items-baseline justify-between border-t border-divider pt-3 font-semibold text-fg-strong">
                    <span>Precio unitario</span>
                    <Numeric>{formatCLP(185_000)}</Numeric>
                  </div>
                </div>
              </Panel>
            </div>
          </Section>

          {/* ── Inspector y barra ── */}
          <Section id="inspector" title="Inspector y barra de herramientas" description="El patrón del editor: lienzo estable al centro con su barra, inspector de 320 px a la derecha con el total en vivo fijo al pie.">
            <div className="flex h-[560px] overflow-hidden rounded-lg border border-divider bg-surface">
              <div className="flex min-w-0 flex-1 flex-col">
                <Toolbar aria-label="Herramientas del lienzo">
                  <ToolbarTitle count="V1 de 3">Casa Fuentes</ToolbarTitle>
                  <ToolbarSpacer />
                  <ToolbarGroup>
                    <IconButton icon={Undo2} label="Deshacer" size="sm" shortcut="mod+z" />
                    <IconButton icon={Redo2} label="Rehacer" size="sm" />
                  </ToolbarGroup>
                  <ToolbarSeparator />
                  <SegmentedControl
                    aria-label="Vista"
                    size="sm"
                    value={view}
                    onValueChange={setView}
                    options={[
                      { value: 'design', label: 'Diseño' },
                      { value: 'document', label: 'Documento' },
                    ]}
                  />
                  <ToolbarSeparator />
                  <Button size="sm" variant="primary" icon={Send}>
                    Enviar
                  </Button>
                </Toolbar>
                <div className="relative grid flex-1 place-items-center bg-canvas">
                  <WindowSketch kind="tilt_turn" width={width ?? 1200} height={height ?? 1000} dimensions size={320} className="text-frame-line" />
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                    <Toolbar aria-label="Zoom" variant="floating">
                      <IconButton icon={Minus} label="Alejar" size="sm" />
                      <span className="dim w-12 text-center text-table text-fg-muted">100 %</span>
                      <IconButton icon={Plus} label="Acercar" size="sm" />
                    </Toolbar>
                  </div>
                </div>
              </div>
              <Inspector aria-label="Ventana V1" className="w-80 shrink-0 border-l border-divider">
                <InspectorHeader
                  eyebrow="V1"
                  title="Living"
                  description="Oscilobatiente · PRO 70"
                  media={<WindowSketch kind="tilt_turn" size={40} />}
                  actions={<IconButton icon={MoreHorizontal} label="Más acciones" size="sm" />}
                />
                <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">
                  <InspectorSection title="Medidas">
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField value={width} onChange={setWidth} aria-label="Ancho" />
                      <NumberField value={height} onChange={setHeight} aria-label="Alto" />
                    </div>
                    <InspectorRow label="Superficie" kind="mono">
                      {formatArea(((width ?? 0) * (height ?? 0)) / 1_000_000)}
                    </InspectorRow>
                  </InspectorSection>
                  <InspectorSection title="Acabado" collapsible>
                    <ColorSwatchGroup aria-label="Color" value={color} onValueChange={setColor} colors={COLORS.slice(0, 5)} />
                    <InspectorRow label="Vidrio">DVH 4/12/4 · incoloro</InspectorRow>
                    <InspectorRow label="Manilla">Blanca · derecha</InspectorRow>
                  </InspectorSection>
                  <InspectorSection title="Cantidad">
                    <div className="flex items-center justify-between">
                      <span className="text-table text-fg-muted">Unidades</span>
                      <div className="flex items-center gap-1">
                        <IconButton icon={Minus} label="Quitar una" size="sm" variant="secondary" onClick={() => setQty((q) => Math.max(1, q - 1))} />
                        <span className="dim w-8 text-center">{qty}</span>
                        <IconButton icon={Plus} label="Agregar una" size="sm" variant="secondary" onClick={() => setQty((q) => q + 1)} />
                      </div>
                    </div>
                  </InspectorSection>
                </div>
                <InspectorFooter>
                  <div className="flex items-baseline justify-between">
                    <span className="text-table text-fg-muted">
                      {qty} × {formatCLP(unit)}
                    </span>
                    <Flash trigger={total}>
                      <Numeric size="lg">{formatCLP(total)}</Numeric>
                    </Flash>
                  </div>
                </InspectorFooter>
              </Inspector>
            </div>
          </Section>

          {/* ── Tabla ── */}
          <Section id="tabla" title="Tabla de datos" description="Identidad a la izquierda, dinero a la derecha. Sin caja: corre sobre la hoja. Filas de 44 px, o 56 si lleva dos líneas; la selección se marca por tono. Edición en línea en «Obra».">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input icon={Search} placeholder="Buscar obra o cliente" value={query} onChange={(e) => setQuery(e.target.value)} wrapperClassName="w-72" />
                <Select
                  size="md"
                  className="w-44"
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  options={[{ value: 'all' as const, label: 'Todos los estados' }, ...QUOTE_STATUS_ORDER.map((s) => ({ value: s, label: <StatusPill status={s} size="sm" /> }))]}
                />
                <IconButton icon={SlidersHorizontal} label="Más filtros" variant="secondary" />
              </div>
              <DataTable
                rows={rows}
                columns={columns}
                getRowId={(q) => q.id}
                caption="Cotizaciones de ejemplo"
                query={query}
                filter={statusFilter === 'all' ? undefined : (q) => q.status === statusFilter}
                onClearFilters={() => {
                  setQuery('')
                  setStatusFilter('all')
                }}
                selectable
                selected={selected}
                onSelectedChange={setSelected}
                bulkActions={(sel, clear) => (
                  <>
                    <Button size="sm" variant="ghost" icon={Download}>
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => {
                        const ids = new Set(sel.map((s) => s.id))
                        const before = rows
                        setRows((list) => list.filter((q) => !ids.has(q.id)))
                        clear()
                        toastUndo(`Moviste ${sel.length} a la papelera`, () => setRows(before))
                      }}
                    >
                      Eliminar
                    </Button>
                  </>
                )}
                noun={['cotización', 'cotizaciones']}
                defaultSort={{ id: 'number', dir: 'desc' }}
              />
              <div className="grid items-start gap-3 lg:grid-cols-2">
                <div className="overflow-hidden rounded-md border border-divider bg-surface">
                  <SkeletonRows rows={3} columns={5} />
                </div>
                <DataTable
                  rows={[] as SampleQuote[]}
                  columns={columns.slice(0, 3)}
                  getRowId={(q) => q.id}
                  caption="Vacía"
                  empty={
                    <Card padding="none">
                      <EmptyState size="compact" sketch="sliding" title="Sin cotizaciones para este cliente" description="Crea una desde aquí y quedará asociada." action={<Button size="sm" icon={Plus}>Nueva cotización</Button>} />
                    </Card>
                  }
                />
              </div>
            </div>
          </Section>

          {/* ── Superposiciones ── */}
          <Section id="superposiciones" title="Superposiciones" description="Diálogos solo para lo irreversible o externo; para lo demás, deshacer. Menús y popovers: 140 ms desde su disparador. La paleta abre sin animación.">
            <div className="flex flex-wrap items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Diálogo</Button>
                </DialogTrigger>
                <DialogContent
                  title="¿Enviar la cotización N° 184?"
                  description="Marcela Fuentes la recibirá por correo con el enlace a la propuesta."
                  footer={
                    <>
                      <DialogClose asChild>
                        <Button variant="ghost">Cancelar</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button variant="primary" icon={Send} onClick={() => toast.success('Cotización enviada')}>
                          Enviar
                        </Button>
                      </DialogClose>
                    </>
                  }
                >
                  <div className="flex items-center gap-4 rounded-md border border-divider bg-sunken p-3">
                    <WindowSketch kind="sliding" size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-fg-strong">Casa Fuentes · ampliación</div>
                      <div className="text-table text-fg-muted">3 ventanas · 4 unidades</div>
                    </div>
                    <Numeric size="lg">{formatCLP(928_200)}</Numeric>
                  </div>
                </DialogContent>
              </Dialog>
              <Sheet>
                <SheetTrigger asChild>
                  <Button icon={Users}>Hoja lateral</Button>
                </SheetTrigger>
                <SheetContent title="Nuevo cliente" description="Solo el nombre es necesario." footer={<Button variant="primary">Crear cliente</Button>}>
                  <div className="flex flex-col gap-4">
                    <Field label="Nombre">
                      <Input autoFocus placeholder="Nombre o empresa" />
                    </Field>
                    <Field label="Teléfono" optional>
                      <Input placeholder="+56 9 …" />
                    </Field>
                  </div>
                </SheetContent>
              </Sheet>
              <Popover>
                <PopoverTrigger asChild>
                  <Button>Popover</Button>
                </PopoverTrigger>
                <PopoverContent className="w-72">
                  <div className="flex flex-col gap-3">
                    <div className="text-table font-semibold text-fg-strong">Aplicar a todas las ventanas</div>
                    <ColorSwatchGroup aria-label="Color" value={color} onValueChange={setColor} colors={COLORS} />
                    <Button size="sm" variant="primary" className="self-end">
                      Aplicar a 3 ventanas
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button iconRight={MoreHorizontal}>Menú</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Cotización N° 184</DropdownMenuLabel>
                  <DropdownMenuItem icon={Copy} shortcut="mod+d">
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem icon={Download} hint="PDF">
                    Descargar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={Trash2} danger>
                    Mover a la papelera
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip content="Duplicar ventana" shortcut="mod+d">
                <Button>Tooltip</Button>
              </Tooltip>
              <Button icon={Search} onClick={() => setPaletteOpen(true)} shortcut="mod+k">
                Paleta de comandos
              </Button>
              <Button onClick={() => toastUndo('Borraste la V3', () => toast('Restaurada'))}>Aviso con deshacer</Button>
              <Button onClick={() => toast.success('Cotización enviada', { description: 'Marcela Fuentes · hace un momento' })}>Aviso de éxito</Button>
            </div>
            <CommandPalette
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              onAsk={() => toast('El asistente respondería aquí')}
              groups={[
                {
                  heading: 'Acciones',
                  items: [
                    { id: 'new', label: 'Nueva cotización', icon: FilePlus2, shortcut: 'n', onSelect: () => {} },
                    { id: 'client', label: 'Nuevo cliente', icon: Users, onSelect: () => {} },
                  ],
                },
                {
                  heading: 'Cotizaciones',
                  items: SAMPLE_QUOTES.slice(0, 4).map((q) => ({
                    id: q.id,
                    label: q.title,
                    hint: `N° ${q.number} · ${formatCLP(q.total)}`,
                    icon: <WindowSketch kind="casement" size={16} />,
                    onSelect: () => {},
                  })),
                },
              ]}
            />
          </Section>

          {/* ── Los tres temas ── */}
          <Section id="comparar" title="Original, Blanco y Oscuro" description="Original es el oficial: marco de tinta y hoja con tono. El oscuro es una composición propia: las superficies suben aclarándose y la señal no cambia de rol.">
            <div className="grid gap-4 xl:grid-cols-3">
              <div data-theme="original">
                <Sampler />
              </div>
              <div data-theme="light">
                <Sampler />
              </div>
              <div data-theme="dark">
                <Sampler />
              </div>
            </div>
          </Section>

          {/* ── Íconos ── */}
          <Section id="iconos" title="Íconos del rubro" description="Retícula de 24, trazo 1,75 como lucide. Convención de aperturas: líneas desde el lado de cierre al centro del lado de bisagras; discontinua si se aleja.">
            <div className="overflow-hidden rounded-lg border border-divider bg-surface">
              <div className="-mr-px -mb-px grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7">
              {DEKOPEN_ICONS.map(({ name, Icon }) => (
                <div key={name} className="flex flex-col items-center gap-2.5 border-r border-b border-divider px-2 py-4 text-fg">
                  <div className="flex items-center gap-3">
                    <Icon className="size-4" strokeWidth={1.75} />
                    <Icon className="size-6" strokeWidth={1.75} />
                  </div>
                  <span className="code-id max-w-full truncate text-micro text-fg-muted">{name.replace('Icon', '')}</span>
                </div>
              ))}
              </div>
            </div>
          </Section>

          {/* ── Dibujos ── */}
          <Section id="dibujos" title="Dibujos de trazo fino" description="Para vacíos y acceso. Trazo en tinta; las cotas van en cifras tabulares.">
            <div className="flex flex-wrap items-end gap-8 rounded-lg border border-divider bg-surface p-8">
              {(['fixed', 'casement', 'tilt_turn', 'double', 'sliding', 'transom', 'triple', 'door'] as SketchKind[]).map((k) => (
                <WindowSketch key={k} kind={k} size={k === 'door' ? 140 : 96} accentEdge title={k} />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-10 rounded-lg border border-divider bg-surface p-8">
              <WindowSketch kind="sliding" width={1800} height={1300} dimensions size={200} />
              <div className="flex items-center gap-4">
                <Avatar name="Marcela Fuentes" />
                <Avatar name="Ana Revisión" tone="ink" size="lg" />
                <Avatar name="Jorge Contreras" size="sm" />
              </div>
            </div>
            <div className="mt-6">
              <PlanGate feature="client3d" allowed={false} variant="card">
                <Card>
                  <CardHeader title="Vista 3D para el cliente" description="Tu cliente gira la ventana en el portal." />
                </Card>
              </PlanGate>
            </div>
          </Section>
        </main>
      </div>
    </div>
  )
}
