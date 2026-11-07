# DEKOPEN v6 · objetivo de diseño por pantalla

Lee antes `docs/DESIGN.md` (tokens y reglas) y mira `/dev/ui` en claro y oscuro. Esto describe el objetivo de cada pantalla. Mantén el flujo y la simplicidad: cambia la composición, no la tarea.

## 0. Reglas comunes

- **Empieza por quitar.** Saca `Card` y `Panel` donde solo agrupan; deja hoja, aire y separadores.
- **Tokens, no valores sueltos.** Nada de `text-[13px]`, `rounded-[…]`, `shadow-[…]`, `font-mono`, `uppercase`, `tracking-*`.
- **Secciones** con `PageSection`; **cifras** con `StatStrip` + `KPI variant="plain"`; **filas** con `RowTitle` y `DataTable density="comfortable" bleed`.
- **Una primaria por vista** (`Button variant="primary"`). Si hay dos objetos amarillos, sobra uno.
- **Selección por tono**, sin filo. `bg-accent-subtle` o `bg-surface shadow-raised`.
- **Estado** con `StatusPill` (glifo + texto).
- **Avisos en línea** con `Notice`; deshacer con `toastUndo`.
- **Carga**: conservar el layout; `Skeleton*` con la forma real; nunca spinner a pantalla completa.
- **Vacíos**: distinguir primera vez (`EmptyState` sin caja), sin resultados (eco del filtro + «Quitar filtros»), cero válido y dato faltante (qué falta + enlace).
- **Movimiento**: tabla de DESIGN §7. Nada anima al teclear salvo `Flash` del total.
- **Temas**: probar claro y oscuro. Documentos, PDF y portal siempre claros.
- **Táctil**: controles 44 px; filas 56 si la pantalla es de uso táctil.
- **Datos de ejemplo** siempre marcados como ejemplo. Sin la palabra «demo».

## 1. Shell (`app/shell/**`, ya construido)

Marco `bg-frame` + hoja `bg-canvas` con radio 16 y 8 px de aire. Barra lateral 224: empresa, buscar (⌘K), navegación (activo = pastilla `bg-surface shadow-raised`), uso del plan sin caja, ajustes, logotipo. Topbar de 48 dentro de la hoja, sin línea: migas solo en subpáginas (`TopbarPortal` para contexto propio), asistente y cuenta. Teléfono: la hoja ocupa todo, barra inferior 4 destinos + «Más». `AccountBanner` = `Notice` a lo ancho.

## 2. Inicio (`features/home`)

Responde «¿qué necesita mi atención?». Fecha y saludo chicos. `StatStrip` con Por seguir, Enviadas, Aceptado este mes, En taller. Debajo una lista «Por seguir» y otra «Recientes» a todo el ancho, con miniatura real, obra, cliente, estado, días y total. Columna derecha solo con contenido real. Primera vez: `EmptyState` + «Crear tu primera cotización» y progreso escrito. Carga: `StatStrip` de esqueletos + `SkeletonRows`.

## 3. Lista de cotizaciones (`features/quotes/QuotesPage`)

`PageHeader` + primaria «Nueva cotización». `StatStrip` con tres cifras del filtro activo. Filtros pequeños (`Button size="sm" variant="secondary" iconRight={ChevronDown}`, `Input size="sm" icon={Search}`). Tabla `density="comfortable" bleed`: `RowTitle` con miniatura 40, obra y cliente; estado; fecha; total a la derecha. Selección múltiple con barra flotante. Teléfono: lista de dos líneas. Vacíos según §0.

## 4. Editor de cotización (`features/quotes/editor`)

El corazón. Tres zonas sin tarjetas:

- **Cabecera 56**: obra editable, cliente, N°, estado, `SaveIndicator`, menú, **primaria única**.
- **Ítems** 264, `bg-sunken`: filas sin borde con miniatura realista, medida, cantidad, subtotal; activa `bg-surface shadow-raised`. Abajo «Agregar ventana» (`subtle`, `shortcut="a"`).
- **Escenario** `bg-sunken`, sin cuadrícula: dibujo centrado, cotas, `Toolbar variant="floating"` de zoom.
- **Inspector** 320–336: pestañas «Esta ventana» y «Toda la cotización». Ventana: cantidad, paño elegido, medidas, tipología, línea, color y vidrio a la vista; accesorios, forma, referencia y ubicación, nota y precio plegados al final con su estado a la derecha. Pie con subtotal.
- **Conjuntos**: se arman en el dibujo. El «+» de cada borde duplica la ventana y la une; el chip de cada unión abre ángulo, dirección y pieza.
- **Resumen**: neto, descuento, IVA explícito y total `Numeric size="total"` en posición fija abajo a la derecha, con `Flash`.

< 1280: ítems colapsables, inspector como hoja. < 768: `MobileEditor`, total fijo con zona segura.

## 5. Diseñador (`features/designer`)

`TypologyPicker`: diálogo `xl`, hoja inferior en teléfono. Lista de grupos a la izquierda; dibujos reales sobre `bg-sunken` con nombre debajo, sin tarjetas; elegido con contorno tinta; búsqueda arriba, recientes primero, flechas y Enter. Lienzo (dueño del dibujo): manijas y selección en `--dk-select`.

## 6. Clientes (`features/clients`)

Lista `density="comfortable" bleed`: nombre, ciudad o teléfono; cotizaciones y total aceptado a la derecha. Ficha: encabezado con nombre grande y datos en línea editables en el sitio; historial de cotizaciones con la misma tabla. Sin tarjetas.

## 7. Taller (`features/workshop`)

Tablero por estación sobre `bg-sunken`; aquí sí tarjeta, porque se arrastra (siempre con menú «Mover a…»). Órdenes en tabla con avance `Meter`. Cortes legibles a un metro: `text-lead`, cifras tabulares, barras con piezas en tinta y despunte en `bg-hover`, casillas de 24 px.

## 8. Catálogo (`features/catalog`)

Una cifra de preparación arriba («21 de 26 líneas listas») con enlace al primer faltante. Marcas en tabla: nombre, líneas, `Meter` de precios, interruptor al final. Inactivas en lista compacta plegada. Colores: muestras cuadradas con textura, sin caja. Precios: `DataTable` con edición en línea.

## 9. Documentos (`features/documents`)

Galería de 5 plantillas: página real con `shadow-raised` sobre `bg-sunken`, nombre debajo. El editor sigue el patrón del editor de cotización.

## 10. Ajustes (`features/settings`)

Lista lateral de secciones de 200 sin íconos. Contenido en grupos con `PageSection`, sin `Panel`. Autoguardado con ✓. Vista previa a la derecha solo donde cambia algo visible. Plan: tabla comparativa simple.

## 11. Asistente (`features/assistant`)

Panel derecho 400 como segunda hoja dentro del marco. Usuario a la derecha con `bg-hover`; respuestas sin burbuja. Actividad en una línea atenuada. Aprobación: contenedor único con cifras antes y después y primaria «Aprobar». El avatar es el único objeto expresivo.

## 12. Acceso (`features/auth`)

Dos columnas: formulario centrado 360 a la izquierda; a la derecha `bg-frame` con el dibujo real grande, sin titular ni tablas de datos. Primaria de ancho completo. Teléfono: una columna.

## 13. Bienvenida (`features/onboarding`)

«Paso 2 de 4» en texto y `Meter` delgado; sin círculos numerados. Una columna de 520, una decisión visible a la vez. A la derecha la cotización real en vivo sobre `bg-sunken`.

## 14. Landing (`features/landing`)

Fondo blanco. Titular `text-display-lg` a la izquierda, una frase, sin palabra tratada. Producto real grande. Un botón amarillo en el héroe. Una sección con `data-theme="dark"`. Composición asimétrica; ninguna fila de 3 tarjetas; planes en tabla; cierre con el logotipo grande. Sin papel cuadriculado, degradados ni cotas decorativas.

## 15. Portal del cliente (`features/portal`)

Siempre claro. Marca del taller primero; el acento es el color del taller. Total grande solo al final. Aceptar con `Button variant="ink"` o el color del taller. Usar `THEME_TOKENS` y `THEME_META_COLOR`.

## 16. Contratos

- `apps/web/src/styles.css`: tokens y utilidades (`tabular`, `figure`, `scrollbar-quiet`, `ring-focus`; movimiento `fz-overlay`, `fz-pop`, `fz-dialog`, `fz-sheet-*`, `fz-rise`, `fz-check`, `fz-flash-layer`, `fz-spin`, `fz-breathe`, `fz-skeleton`).
- `apps/web/src/brand`: `THEME_TOKENS`, `THEME_META_COLOR`, `BRAND_COLORS`, `CHART_COLORS`, `MOTION`, `CONTROL_HEIGHT`, geometría del logo.
- `apps/web/src/ui`: nuevos `PageSection`, `StatStrip`, `RowTitle`, `StatusGlyph`, `Button variant="ink"`, `DataTable density|bleed`.
- `apps/web/public`: íconos, `og.png`, manifiesto.
