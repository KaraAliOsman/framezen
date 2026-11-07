# DEKOPEN · sistema de diseño v3 «Huincha»

Una hoja dentro de un marco quieto. Tinta para todo lo que está activo y un solo color de verdad: el amarillo de la huincha de medir, reservado para la acción principal. Sin cajas por defecto; la ventana dibujada, el cliente y el total son lo que se ve.

Fuente de verdad de los valores: `apps/web/src/styles.css`. Vitrina viva: `/dev/ui` (Original, Blanco y Oscuro lado a lado). Objetivo por pantalla: `docs/PANTALLAS.md`.

## 1. Principios

1. **Simple primero, profundidad a pedido.** Una acción primaria por vista; lo avanzado en el inspector, menús o ⌘K.
2. **Hoja, no cajas.** Por defecto no hay tarjetas. Una tarjeta solo existe si el contenedor se toca, se arrastra o se elige. Agrupar se hace con aire.
3. **La cifra manda.** Número grande arriba, etiqueta debajo, contexto al final. Un monto o una medida nunca se truncan.
4. **Nunca bloquear.** Autoguardado, deshacer en vez de confirmar, avisos en línea, precios en vivo.
5. **Un solo color.** Si en una vista hay más de un objeto amarillo, sobra uno (la marca no cuenta).
6. **Rápido y físico.** Respuesta local inmediata; presionar se siente, nada rebota, las cifras no bailan.
7. **Tres temas de verdad.** Original por defecto; Blanco y Oscuro con composición propia. Documentos, portal y landing siempre en claro.

## 2. Tokens

Las tablas de esta sección traen los valores de Blanco y Oscuro; los de Original están en §11.

Tres capas en `styles.css`: variables de tema `--dk-*`, alias heredados (`--paper-*`, `--ink-*`, `--ok/warn/bad-*`) y `@theme inline` con las utilidades de Tailwind (`bg-surface`, `text-fg-muted`…). Las ≈2 700 clases existentes siguen funcionando.

`dark:` sigue al tema **más cercano**. Preferir tokens a `dark:`: casi nunca hace falta. Un bloque con `data-theme="dark"` dentro de una página clara funciona (sección negra de la landing).

### 2.1 Roles

| Rol | Clases | Claro | Oscuro | Regla |
| --- | --- | --- | --- | --- |
| **Señal** | `bg-signal text-on-signal`, `hover:bg-signal-hover` | `#FFD21F` | `#FFD60A` | Solo el botón primario (uno por vista), la marca, el destello del total y una serie destacada. Texto siempre tinta. **Nunca** texto, borde, fondo de panel ni selección |
| **Tinta** | `bg-accent text-fg-on-accent`, `text-accent`, `border-accent` | `#15161D` | `#F1F1F4` | Todo lo activo: casilla, interruptor, pestaña, enlace, foco. `accent` es un nombre heredado: ya no es un color |
| **Selección del lienzo** | `--dk-select`, `--dk-select-ring` | `#1F6BFF` | `#6EA4FF` | Solo sobre el dibujo y la hoja del documento (nodo o sección elegida, manijas). Nunca en botones ni listas |

### 2.2 Superficies, bordes y texto

| Clase | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `bg-frame` | `#F0F0F3` | `#0D0E12` | Marco de la app (barra lateral) y paneles decorativos de acceso |
| `bg-canvas` | `#FFFFFF` | `#141519` | La hoja |
| `bg-surface` | `#FFFFFF` | `#191A20` | Campos, tarjetas que se tocan |
| `bg-sunken` | `#F7F7F9` | `#101115` | Escenario del dibujo, columna de ítems, pies |
| `bg-raised` | `#FFFFFF` | `#202128` | Flotantes |
| `bg-hover` · `bg-pressed` | `#F2F2F5` · `#E9E9EE` | `#23242C` · `#2C2D36` | Estados de filas y controles |
| `bg-plate` `shadow-plate` | transparente | transparente | Placa de listas y tablas. Solo se ve en Original; en los otros temas no agrega caja |
| `bg-nav-active` `text-nav-active-fg` | `#FFFFFF` | `#191A20` | Sección activa de la barra lateral |
| `bg-tabbar` | `#FFFFFF` | `#141519` | Barra inferior del teléfono |
| `bg-inverse text-fg-inverse` | `#15161D` | `#2C2D36` | Tooltips, toasts, barra de selección |
| `bg-scrim` (`.fz-overlay`) | tinta 32 % | negro 58 % | Velo |
| `border-divider` · `border-divider-strong` | `#EBEBEF` · `#DCDCE3` | `#26272F` · `#363741` | Separadores · botones secundarios |
| `border-control` | `#92939F` (3:1) | `#6F707D` (3:1) | Borde de campos |
| `text-fg-strong` · `text-fg` | `#15161D` · `#24252E` | `#F6F6F8` · `#E3E3E9` | Títulos y cifras · texto |
| `text-fg-muted` | `#62636F` (5,9:1) | `#A3A4B1` | Secundario |
| `text-fg-faint` | `#767783` | `#868794` | Placeholders y deshabilitado, no para leer |

`bg-accent-subtle` y `bg-accent-subtle-strong` son tonos neutros de selección. `accent-line` es un borde neutro. `text-accent-ink` es tinta.

### 2.3 Estados (tinta / fondo / borde)

| Estado | Clases | Claro | Oscuro |
| --- | --- | --- | --- |
| Éxito | `text-success bg-success-bg border-success-line` | `#0B7A4D / #E7F6EE / #A8DCC2` | `#5FD3A0 / #10291F / #24604A` |
| Aviso | `text-warning bg-warning-bg border-warning-line` | `#AD4A00 / #FFF1E5 / #F6CCA9` | `#FFA964 / #33200F / #7A4A22` |
| Peligro | `text-danger bg-danger-bg border-danger-line` | `#C81E36 / #FDECEF / #F6BAC4` | `#FF8D9E / #36161D / #84303F` |
| Información | `text-info bg-info-bg border-info-line` | `#1D5FD6 / #EBF2FE / #B6CDF7` | `#9DC0FF / #162440 / #36548C` |

El aviso es naranjo a propósito: la señal no significa cuidado.

### 2.4 Gráficos, dibujo y materiales

- Series `--dk-chart-1…6` (`CHART_COLORS`): tinta, gris, azul, ámbar, coral, verde. La serie que importa va en tinta o en señal; el resto, neutras.
- Dibujo: `--dk-frame-line`, `--dk-dimension`, `--dk-dimension-text`, `--sketch-glass-opacity`, `--sketch-glint-opacity`.
- Materiales: fijos, son datos del producto (`pvc-*`, `glass`, `gasket`).

### 2.5 Nombres heredados

| Heredado | Ahora | Preferir |
| --- | --- | --- |
| `paper-0/50/100/200/350/600/900` | superficie, hoja, hover, divisor, control, atenuado, texto | Nombres semánticos |
| `ink-50/100/500/600/700` | tono, tono fuerte, foco, tinta, tinta | `bg-accent-subtle`, `text-accent` |
| `ok/warn/bad-50/600/800` | estados | `bg-success-bg`, `text-success`… |
| `edge-accent` | Marca por tono, ya no dibuja el filo | `bg-accent-subtle` |
| `dim`, `code-id`, `font-mono`, `narrow` | Cifras tabulares en la familia de interfaz | `tabular` |

Quien fije un tema en línea (el portal fuerza claro) debe copiar **todas** las variables de `THEME_TOKENS` (`brand/tokens.ts`) y usar `THEME_META_COLOR`.

## 3. Tipografía

- **Funnel Sans** (`@fontsource-variable/funnel-sans`, OFL, 300–800): toda la interfaz. Pesos 400 / 500 / 600.
- **Funnel Display** (`@fontsource-variable/funnel-display`, OFL, 300–800): `h1`, `h2`, cifras grandes (`font-display`, utilidad `figure`). Títulos en **500**: el peso 700 no se usa.
- Latin y latin-ext por `unicode-range`: ñ, ç, ß/ẞ, İ ı Ş ş Ğ ğ.
- **Sin monoespaciada.** Medidas, N° y montos usan cifras tabulares (`tabular`). `kbd` y `code` también.

| Clase | Tamaño / interlineado | Uso |
| --- | --- | --- |
| `text-micro` | 11 / 14 | Teclas, chips |
| `text-meta` | 12 / 16 | Metadatos mínimos |
| `text-table` | 13 / 18 | Secundario, etiquetas de campo, encabezados de tabla |
| `text-base` | 14 / 20 | Texto y filas |
| `text-lead` | 16 / 24 | Táctil, introducciones |
| `text-h4` | 15 / 22 | Título de grupo |
| `text-h3` | 18 / 24 | Título de sección, diálogo, inspector |
| `text-h2` | 22 / 28 | Título en teléfono |
| `text-h1` | 28 / 34 | Título de página (un sustantivo), cifras de `KPI` |
| `text-figure` | 32 / 38 | Total de la cotización |
| `text-display-sm` · `text-display` · `text-display-lg` | 44/48 · 64/66 · 88/88 | Landing |

Mayúsculas solo para identificadores reales y el logotipo. Nada de etiquetas en mayúsculas con espaciado. Peso antes que color para jerarquía.

## 4. Cifras, medidas y formato

- Montos: `tabular` o `<Numeric kind="money">`, a la derecha, moneda explícita. El total vive en `text-figure` en posición fija. Con decimales, `Numeric size="total"` los deja pequeños y voladitos.
- Medidas: `1.200 × 1.000 mm` con `×`, unidad atenuada. Superficie `1,20 m²`.
- Formato siempre por el formateador del locale (`useFormat`, `formatMoney`). `Numeric` no formatea.
- Cero válido = «0» con su unidad; falta de dato ≠ cero: decir qué falta y enlazar el campo.
- Precio en vivo: cambia al instante; `Flash` de 700 ms con la señal es la única animación.

## 5. Retícula, espacio y densidad

- Ritmo de 4 px.
- Alturas: control **36 px escritorio, 44 táctil** (`touch:`); `sm` 30; `xs` 26; filas 44, de dos líneas 56; cabecera de tabla 36; barra de herramientas 48.
- Formularios: 6 px etiqueta-control, 16 px entre campos, 32 px entre grupos.
- Shell: marco 8 px alrededor de la hoja, barra lateral 224 (56 colapsada), topbar 48 dentro de la hoja.
- `Page`: márgenes 16/24/40, anchos `narrow` 768, `default` 1152, `wide` 1440, `full`. `PageHeader`: título, contexto, acciones a la derecha. `PageSection`: 40 px entre secciones.
- Editor ancho (≥ 1280): ítems 264 · escenario flexible · inspector 320–336. 768–1279: inspector como hoja o pestañas. < 768: una columna, hoja inferior, resumen fijo con zona segura.
- Densidad por método de entrada, no por ancho.

## 6. Forma y elevación

| Token | Valor | Uso |
| --- | --- | --- |
| `rounded-xs` | 5 | Ítems de menú, chips, teclas |
| `rounded-sm` / `rounded-control` | 8 | Botones, campos, segmentados |
| `rounded-md` / `rounded-panel` | 12 | Tarjetas, menús, popovers |
| `rounded-lg` / `rounded-dialog` | 16 | Hoja, diálogos, paneles laterales, paleta |

- Reposo: **sin sombra**.
- `shadow-raised` (pastilla activa, hoja), `shadow-float` (menús), `shadow-pop` (diálogos, hojas laterales, toasts). Las sombras traen su propio filo: los flotantes no llevan borde.
- Nunca apilar borde + sombra + degradado.

## 7. Movimiento

Solo `opacity` y `transform`. Salidas más cortas que entradas. Curvas en tokens: `ease-out` `(.23,1,.32,1)`, `ease-drawer` `(.32,.72,0,1)`.

| Momento | Duración | Notas |
| --- | --- | --- |
| Presionar | 100 ms | `scale(.97)`; íconos `.94` |
| Hover / color | 100 ms | Sin animar movimiento |
| Menús, popovers, tooltips | 140 · salida 100 | Nacen desde el disparador (`--radix-*-transform-origin`), desde `.97` |
| Tooltip siguiente | 0 | Sin demora ni animación mientras uno esté abierto |
| Paleta ⌘K | 0 | Se usa cien veces al día: no anima |
| Diálogo | 180 · salida 110 | Centrado, sin recorrido |
| Hojas laterales | 280 · salida 180 | Curva de cajón |
| Segmentado | 160 | La pastilla se desliza |
| Casilla | 120 | El visto entra desde `.6` |
| Total | 700 | Destello de señal, solo opacidad |
| Marketing | 320–480, una vez | Sin parallax |

Nada anima al teclear. `prefers-reduced-motion` elimina recorridos. En JS: `MOTION` de `brand/tokens.ts`.

## 8. Íconos

- **lucide-react** para lo genérico; trazo 1,75; 16 px junto a texto denso, 18 en barras.
- **Set propio** `apps/web/src/ui/icons` para el rubro; `OPENING_ICONS[kind]` mapea las aperturas del motor.
- Monocromos, nunca dentro de cuadritos de color. El asistente se representa con su avatar, nunca con destellos.

## 9. Componentes (`apps/web/src/ui`, importar desde `'../ui'`)

| Componente | Reglas |
| --- | --- |
| `Button` (`primary` · `ink` · `secondary` · `ghost` · `subtle` · `danger`; `xs/sm/md/lg`) | `primary` es señal: una por vista. `ink` es fuerte sin señal. `loading` conserva el ancho. `shortcut` muestra la tecla. |
| `IconButton` | `label` obligatorio. `aria-pressed` para alternadores. |
| `Input`, `Textarea`, `NumberField`, `MoneyField`, `Select`, `Combobox`, `Field` | Dentro de `Field`. Error = qué pasó + cómo seguir. Foco = borde de tinta + aro. |
| `SegmentedControl`, `Tabs` (`line` · `pill`) | 2–5 opciones excluyentes. Línea para secciones; píldora dentro de paneles. |
| `Switch`, `Checkbox`, `RadioCards`, `Slider`, `ColorSwatch(Group)` | Muestras cuadradas; `image` para foliados. |
| `StatusPill`, `StatusGlyph`, `StatusDot`, `Badge` | El estado es glifo + texto sin fondo. `Badge` poco y casi nunca. |
| `Notice` | Aviso en línea con tinte, sin borde. Reemplaza los bloqueos. |
| `Meter` | `tone="auto"`: aviso > 80 %, peligro > 95 %. |
| `PageSection`, `StatStrip`, `RowTitle` | Lo normal: sección con aire, cifras sueltas, fila de dos líneas. |
| `KPI` (`plain` · `card`) | Cifra arriba, etiqueta debajo. Variación solo con datos reales. |
| `Card`, `CardHeader`, `Panel` | Solo si el contenedor se toca o se elige. |
| `Inspector*` | Propiedades del objeto seleccionado, secciones separadas por aire. |
| `Toolbar*` | Barra de 48; `floating` sobre el lienzo. |
| `DataTable` | Sin caja. `density="comfortable"` 56 px, `bleed` alinea el texto con el título. Selección por tono. |
| `Dialog`, `Sheet` | Diálogo solo para lo irreversible o externo. Hoja flota con 8 px de aire. |
| `Popover`, `DropdownMenu`, `Tooltip`, `CommandPalette` | Superficie `floatingClass`. |
| `Toaster`, `toast`, `toastUndo` | «Deshacer» 8 s. Nunca un toast por tecla. |
| `EmptyState`, `ZoneError`, `Skeleton*`, `Spinner`, `SaveIndicator` | Vacío: qué va aquí y el siguiente paso, sin caja. Esqueletos con la forma real y barrido lento. Spinner solo dentro de controles. |
| `Page`, `PageHeader`, `PlanGate`, `Kbd`, `KbdHint`, `Numeric`, `Avatar`, `WindowSketch`, `DekopenLogo`, `DekopenMark`, `DekopenWordmark` | Ver §12 para la marca. |

## 10. Hacer / no hacer

Hacer: mostrar la ventana real; totales que concilian; estados escritos; teclas visibles; vacíos que ofrecen el siguiente paso; datos de ejemplo marcados como ejemplo.

No hacer: tarjetas para agrupar, filo de color a la izquierda, etiquetas en mayúsculas espaciadas, monoespaciada, píldoras en todo, íconos en cuadritos de color, degradados decorativos, destellos, papel cuadriculado, cotas como adorno, serif con cursiva, crema, oliva, terracota, verde pizarra, sombras en reposo, señal en más de un botón, cifras animadas en totales, valores arbitrarios cuando existe token.

## 11. Temas

Se elige en Ajustes › Apariencia, en el menú de cuenta o en ⌘K, y se guarda en el navegador (`fz-theme`). Quien nunca eligió ve **Original**. «Como el sistema» elige entre Blanco y Oscuro. Documentos, PDF y portal: siempre claros. La landing se ve en Blanco si toca Original (`useLandingTheme`).

**Original** es el oficial. La huincha es amarilla sobre caja negra: marco en tinta azulada `#1B1D28` (el complemento del amarillo, por eso la señal resalta sin agregar colores) y hoja `#E3E4EC`, un gris tinta muy claro con tono propio. Lo que se toca sube en blanco: campos, placas de listas y tablas, flotantes. Es neutro frío a propósito: nada de crema ni de oliva. Separación hoja/placa 1,27:1 (en Blanco la hoja y sus tablas no se separan); hoja/marco 13:1.

| Rol | Original |
| --- | --- |
| `bg-frame` · `bg-frame-hover` | `#1B1D28` · `#2B2E3D` |
| `bg-canvas` · `bg-sunken` | `#E3E4EC` · `#D8DAE3` |
| `bg-surface` · `bg-raised` · `bg-plate` | `#FFFFFF` |
| `bg-hover` · `bg-pressed` | tinta 6 % · 11 %, para que sirvan sobre hoja y sobre placa |
| `border-divider` · `border-divider-strong` · `border-control` | `#CFD1DB` · `#B9BBC9` · `#797B8C` |
| `text-fg-strong` · `text-fg` · `text-fg-muted` · `text-fg-faint` | `#15161D` · `#23252F` · `#4F5160` · `#5C5E6C` |
| Estados (tinta / fondo) | Éxito `#0A6A44 / #D3EFE1` · Aviso `#964000 / #FDE6D2` · Peligro `#B2182F / #FBDDE2` · Info `#1A53BE / #DAE7FC` |

Todo texto cumple ≥ 4,5:1 sobre hoja, placa, hundido y hover; los bordes de campo, ≥ 3:1. Señal, tinta, selección del lienzo, dibujo y materiales valen lo mismo que en Blanco: la ventana no cambia de color con el tema.

Lo que va sobre el marco de tinta lleva `data-frame` (barra lateral, barra inferior del teléfono, panel de acceso): en Original recalcula los tokens a claro sobre oscuro y en los otros temas no hace nada. Las listas nuevas llevan `bg-plate shadow-plate` con `-mx-3` y su misma sangría adentro, para que en Blanco y Oscuro la geometría no cambie.

**Oscuro:** marco `#0D0E12`, hoja `#141519`, superficies que suben aclarándose. La tinta se invierte; la señal no cambia de rol.

## 12. Marca

- **Marca «Hoja abierta»** (`DekopenMark`): la jamba fija y la hoja que abre. `tone="brand"` = en tinta sobre placa amarilla; `tone="mono"` = una tinta, sin placa.
- **Logotipo** (`DekopenWordmark`): DEKOPEN en Funnel Display, convertido a trazados. Una tinta.
- `DekopenLogo` = marca + logotipo (`sm`, `md`, `lg`).
- No deformar, no sombrear, no texturizar. Nada de amarillo en el logotipo.
- Archivos en `apps/web/public`: `favicon.svg`, `mask-icon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `og.png`, `dekopen-logo.svg`, `site.webmanifest`. Geometría única en `apps/web/src/brand/logo.ts`.

## 13. Accesibilidad

- Texto ≥ 4,5:1, bordes de control ≥ 3:1, foco visible siempre. `forced-colors` respeta `Highlight`.
- Objetivos táctiles ≥ 44 px (`touch:`).
- Estado nunca solo por color: el glifo cambia de forma.
- Teclado: todo lo que se arrastra tiene alternativa; barras con flechas; atajos visibles.
- Probar con alemán, turco, zoom 200 %, movimiento reducido y lector de pantalla.

## 14. Dibujo de ventanas

SVG a escala, vista interior por defecto. Realista por defecto, técnico para taller. Símbolos de apertura según la norma del rubro. Selección en el editor: `--dk-select` y `--dk-select-ring`.

## 15. Documentos impresos

Siempre claros. Tipografía y colores desde los temas de las plantillas; acento = color de marca del taller, nunca la señal.

## 16. Voz

Español de Chile, tuteo, frases cortas, verbos concretos: «Agregar ventana», «Enviar al cliente». Errores: qué pasó + cómo seguir. Sin eslóganes de tres fragmentos, sin rayas como muletilla, sin frases que explican lo obvio. Todo texto nuevo pasa por i18n (7 idiomas).
