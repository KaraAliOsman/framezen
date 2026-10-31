# Framezen · sistema de diseño «Papel y tinta»

Un taller serio y tranquilo: papel cálido, tinta precisa, un solo acento azul tinta que también es el
color de las cotas en los dibujos. Calma (zen) y precisión (marco). Referencias de calidad: Linear, Stripe,
Attio, Framer. Nada de degradados, brillos, glassmorphism,
emojis decorativos ni ilustraciones genéricas. La ventana dibujada es la protagonista.

## Tokens (CSS variables en `apps/web/src/styles.css`, expuestos a Tailwind 4 vía `@theme`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--paper-0` | `#FFFFFF` | superficies (tarjetas, paneles, inputs) |
| `--paper-50` | `#FAF8F5` | fondo de la app |
| `--paper-100` | `#F4F1EC` | fondos secundarios, hover de filas |
| `--paper-200` | `#E4DFD7` | bordes y divisores |
| `--paper-350` | `#9C9489` | borde de inputs (3:1) |
| `--paper-600` | `#6F685E` | texto atenuado |
| `--paper-900` | `#1F1C18` | texto principal |
| `--ink-50` | `#EEF1FC` | fondo de selección / destello de cambio |
| `--ink-100` | `#DCE3FA` | chips seleccionados |
| `--ink-500` | `#3A5BD6` | anillo de foco |
| `--ink-600` | `#2747C2` | acento primario (botón primario, enlaces, cotas) |
| `--ink-700` | `#1F3AA0` | hover primario, cotas en dibujo |
| `--ok-600` `#2F7D4F` / `--ok-50` `#E6F2EA` | éxito |
| `--warn-600` `#A35F00` / `--warn-50` `#FBF0DC` | aviso (ámbar oscuro, nunca mostaza) |
| `--bad-600` `#C23B2E` / `--bad-50` `#FBE8E5` | error |
| Colores de material | PVC blanco `#F6F5F1` (trazo `#B9B2A6`), antracita `#383E42`, negro `#0E0E10`, roble dorado `#A8692E`, nogal `#5B3A22`, winchester `#7A4A2A`, vidrio `#D9EBEE` al 70 % | dibujos |

Modo oscuro (secundario, mismo contraste): fondo `#151311`, superficie `#1E1B18`, borde `#34302B`,
texto `#EDE9E3`, atenuado `#A39D94`, acento `#8EA5EE`.

## Tipografía

- **Instrument Sans Variable** (`@fontsource-variable/instrument-sans`) para todo. Cifras tabulares
  (`font-variant-numeric: tabular-nums`) en montos, medidas y tablas. Para tablas densas y cotas, ancho
  estrecho `font-stretch: 87.5%`.
- **JetBrains Mono** (`@fontsource/jetbrains-mono`) solo para códigos de catálogo (PRO01) y atajos.
- Escala: 12/16 (meta), 13/18 (tabla), 14/20 (base), 16/24 (lead, inputs en móvil), 20/28 (h3),
  24/32 (h2), 32/40 (h1 de página), 48–64 (landing). Pesos 400/500/600; titulares 600 con tracking −0,01 em.

## Forma, espacio y elevación

- Radios: 4 (chips), 6 (inputs, botones), 8 (tarjetas, popovers), 12 (paneles, diálogos), 999 (píldoras).
- Espaciado base 4 px; densidad de oficina: filas de tabla 40 px, inputs 36 px (44 px en táctil).
- Bordes antes que sombras. Sombra cálida solo para flotantes: `0 1px 2px rgb(31 28 24 / .06), 0 8px 24px rgb(31 28 24 / .08)`.
- Foco siempre visible: anillo 2 px `--ink-500` con separación 2 px.

## Movimiento

120 / 160 / 200 / 240 ms. Entrada `cubic-bezier(.2,0,0,1)`, salida `cubic-bezier(.4,0,1,1)`. Solo opacity y
transform. Cuando cambia un total: destello `--ink-50` 600 ms y cifras que ruedan (`motion`). Sin rebotes
(salvo la mascota), sin shimmer, sin confeti. Respetar `prefers-reduced-motion`.

## Iconos

lucide-react, trazo 1,75, 16/18/20 px. Conceptos: inicio `house`, cotizaciones `file-text`, clientes
`users`, taller `factory`, cortes `scissors`, vidrios `square-dashed`, materiales `layers`, catálogo
`library`, documentos `layout-template`, ajustes `settings-2`, ventana `app-window`, puerta `door-open`,
medidas `ruler-dimension-line`, asistente: la cara de Marco (nunca `sparkles`).

## Componentes base (`apps/web/src/ui/`)

Button (primary tinta, secondary borde, ghost, danger; tamaños sm/md/lg; con icono y atajo `Kbd`),
IconButton, Input, NumberField (mm, con flechas y rueda, acepta "1200x1500"), MoneyField (CLP con
separador de miles), Textarea, Select, Combobox (con «crear …»), SegmentedControl, Tabs, Switch,
Checkbox, Radio cards, Slider, ColorSwatch, Badge/StatusPill (borrador gris, enviada tinta, aceptada
verde, rechazada roja, en taller ámbar, instalada verde oscuro), Card, Panel, Dialog, Sheet (lateral e
inferior), Popover, DropdownMenu, Tooltip, Toast (sonner, con «Deshacer»), EmptyState (ilustración =
dibujo de ventana en trazo fino + texto + acción con atajo), Skeleton (bloques quietos, sin shimmer),
DataTable (orden, filtros, selección, edición en línea, sumas), KPI, Avatar, Kbd, CommandPalette (cmdk),
PageHeader, SaveIndicator, PlanGate (explica la función y ofrece mejorar; nunca muro).

## Copia (voz)

Español de Chile, tuteo, frases cortas, verbos concretos. «Agregar ventana», «Enviar al cliente», «Pasar a
taller», «Guardado», «Listo». Errores: qué pasó + cómo seguir («No pudimos conectar. Tus cambios están a
salvo; reintentamos solos.»). Nunca: códigos, «autoridad», «sellado», «Sin dato», «inválido», mayúsculas
gritonas, voseo.

## Dibujo de ventanas (paquete documents, compartido por editor, documentos, portal)

- SVG a escala, vista interior por defecto (exterior = espejo horizontal único).
- Marco y hojas en el color del material con contorno 1 px más oscuro; vidrio `#D9EBEE` con un reflejo
  diagonal sutil de dos líneas finas blancas (no degradado).
- Símbolos de apertura en `--paper-900` al 70 %, trazo 1,25 que no escala: abatir = triángulo con vértice
  en el lado de las bisagras… usar la convención del rubro: líneas desde las esquinas del lado de cierre
  hacia el punto medio del lado de bisagras; continua si abre hacia quien mira, discontinua `6 4` si se
  aleja. Oscilobatiente = ambos símbolos. Proyectante = vértice arriba al centro. Oscilante = vértice abajo.
  Corredera = flecha horizontal del 25 % al 75 % del panel móvil en el sentido de apertura; fijo de
  corredera con «F» pequeña. Manilla dibujada en el lado de cierre.
- Cotas en `--ink-700`, texto 11–12 px tabular, línea fina con remates oblicuos; total exterior y
  parciales por paño.

## Documentos impresos

Carta por defecto. Tipografía del documento elegible (Instrument Sans, una serif editorial — Fraunces —
o una grotesca — Inter Tight). Color de acento = color de marca del taller. Márgenes generosos, jerarquía
clara, el dibujo grande, cifras tabulares alineadas a la derecha, totales en una caja limpia, condiciones
en dos columnas compactas. Cada documento de taller prioriza legibilidad a un metro: medida grande, ítem y
lado debajo, casillas para marcar.

## Logo

Marca: un marco cuadrado redondeado (pared gruesa) con un travesaño vertical a un tercio y un trazo
diagonal fino en el paño grande (el reflejo del vidrio). Logotipo: «framezen» en minúsculas, Instrument
Sans 600, tracking −0,02 em. Una tinta (`--paper-900` sobre claro, `--paper-0` sobre oscuro); acento solo
en el favicon.
