# Framezen · especificación maestra

> Framezen es el software para talleres y fábricas de ventanas y puertas de PVC (y aluminio) en Chile y
> LatAm: diseñas una ventana en segundos, ves su precio al instante, mandas una cotización que vende y
> pasas a taller con cortes optimizados, vidrios, materiales y montaje — sin que nada te bloquee.

Este documento manda sobre todo lo demás. Las fórmulas y valores verificados están aquí y en el código
(`packages/engine/src/types.ts` y las pruebas del motor); la investigación de origen queda fuera del
repositorio. Ni la versión anterior (DEKOPEN v3) ni otros productos del rubro son modelo de diseño ni de
arquitectura: son lo que NO queremos ser.

## 1. Principios (no negociables)

1. **Rápido y simple.** Primera cotización en menos de 3 minutos. Agregar una ventana = elegir tipología,
   escribir ancho × alto, Enter. Todo lo demás tiene valor por defecto visible y editable.
2. **Nunca bloquear.** Nada es obligatorio para dibujar, cotizar, imprimir ni enviar (ni siquiera el
   cliente). Los problemas se muestran como avisos en lenguaje de taller con corrección en un clic. Solo
   se pide confirmación para efectos externos irreversibles (enviar correo/WhatsApp, cobrar, borrar
   definitivamente) y aun así se prefiere *deshacer* (toast con «Deshacer» 8 s) a un diálogo.
3. **Guardado automático siempre.** Indicador sutil «Guardado». Nunca un botón «Guardar» obligatorio.
4. **Precio en vivo.** El motor corre en el navegador: cada cambio recalcula al instante (< 16 ms por
   ventana). El servidor recalcula con el mismo motor al guardar y para los PDF.
5. **El motor es la única fuente de cifras.** Ni la IA ni las plantillas inventan números.
6. **Editable después de enviar.** Editar una cotización enviada crea la revisión siguiente (B, C…)
   automáticamente al reenviar; el cliente siempre ve la última enviada. Sin «sellos», sin «retirar precios».
7. **Lenguaje humano, español de Chile, tuteo** (nunca voseo, nunca jerga técnica ni códigos internos).
   Números humanos: «Cotización N° 412», «OT N° 38», «V3». CLP `$1.234.567`, medidas `1.200 × 1.500 mm`.
8. **Diseño propio, sobrio y premium.** Ver `docs/DESIGN.md` («Papel y tinta»). Nada genérico, sin
   degradados de «startup de IA», nada de plantillas Bootstrap genéricas ni parecido a DEKOPEN v3.
9. **Funciona con una persona o con veinte.** Si hay una sola persona no se muestran roles ni equipo.
10. **Límites de plan suaves.** Una función fuera del plan se ve, se explica y ofrece mejorar; nunca rompe
    un flujo ni esconde datos. Al vencer la prueba la cuenta queda en modo lectura con exportación.

## 2. Arquitectura

Monorepo npm (`npm install`, `npm run dev`, `npm test`, `npm run build`, `npm start`).

```
packages/engine     @framezen/engine     Motor puro TS: diseño, pauta, cortes, vidrios, herrajes, precio, optimizador, tipologías, avisos
packages/catalog    @framezen/catalog    Importador de "informacion de marcas" → Catalog; catálogo base original; CSV MisPrecios
packages/shared     @framezen/shared     Contrato HTTP (api.ts) y planes (plans.ts)
packages/documents  @framezen/documents  Dibujo SVG de ventanas + todas las plantillas de documentos (React, CSS propio, imprimibles)
apps/server         @framezen/server     Hono + Drizzle; PGlite en local (.data/pg) y Postgres con DATABASE_URL; PDF con Chromium (playwright-core)
apps/web            @framezen/web        React 19 + Vite + Tailwind 4 + Radix + motion + TanStack Query + zustand + react-router 7
```

- Los paquetes exportan TypeScript fuente (`main: ./src/index.ts`); Vite y tsx los compilan.
- El servidor sirve `/api/*` y, en producción, los estáticos de `apps/web/dist` con fallback SPA.
- Puertos de desarrollo: API 8787, web 5180 (proxy `/api` → 8787).
- Producción: un único contenedor (Dockerfile raíz) para Railway/Render/Fly; `DATABASE_URL` Postgres.
- Variables de entorno (documentadas en `README.md`; ningún archivo `.env*` se sube): `DATABASE_URL`, `SESSION_SECRET`,
  `APP_URL`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_API_URL`,
  `RESEND_API_KEY`, `MAIL_FROM`, `CATALOG_SOURCE_DIR`, `CHROMIUM_PATH`.

### Datos de marcas (repositorio PÚBLICO)

Los datos de marcas y las listas de precios del dueño (carpeta local indicada en `CATALOG_SOURCE_DIR`)
**no se suben al repositorio.** El importador (`packages/catalog`)
los lee desde `CATALOG_SOURCE_DIR` y genera `.data/catalog/base.json` (ignorado por git). El servidor
siembra el catálogo base desde ese archivo si existe; si no, usa el catálogo de ejemplo original del
repo (`packages/catalog/src/sample.ts`: marcas y líneas genéricas con pautas plausibles, precios de
ejemplo marcados como tales). La app también permite importar un CSV «MisPrecios» desde la interfaz.
No se usan imágenes ni logos de terceros: todo se dibuja en SVG.

## 3. Modelo de dominio (ver `packages/engine/src/types.ts`)

- **Catálogo**: colores, marcas, líneas (pauta + perfiles por rol + reglas de herrajes/accesorios),
  perfiles (precio por barra por color, refuerzo), ítems (herrajes/accesorios con unidad y envase),
  vidrios (precio m², área mínima), ajustes por marca (despunte, corte de sierra, descuentos por familia).
- **Diseño**: `WindowDesign` = línea + medidas + color(es) + vidrio + forma + árbol de nodos
  (`split` con travesaños o unión francesa, `leaf` con apertura, `sliding` con paneles y rieles).
- **Cotización**: ítems (ref, cantidad, diseño, ambiente, precio manual opcional), extras (instalación,
  transporte…), descuento %, textos, revisión, token público, totales.
- **OT**: se crea desde una cotización («Pasar a taller»), numerada, con avance por ítem/estación. Los
  documentos de taller se calculan al vuelo desde la cotización con el motor (no se duplican datos).

### Fórmulas (verificadas al 0,1 mm contra una orden de trabajo real y la plantilla del fabricante)

Pauta de corte (todo en mm; detalle en la documentación de `Pauta` en `packages/engine/src/types.ts` y
casos dorados en `packages/engine/test`):

```
marco (corte)          = cota + 2·weld                                         a 45°
luz (por eje)          = cota − 2·frameDeduction
junquillo de fijo      = luz del paño
vidrio de fijo         = luz del paño − 2·glassGap
hoja nominal           = luz del paño + 2·sashOverlap
hoja (corte)           = hoja nominal + 2·weld                                 a 45°
vidrio de hoja         = hoja nominal − 2·(sashDeduction + glassGap)
junquillo de hoja      = hoja nominal − beadDeduction (por defecto 2·sashDeduction)
travesaño (corte)      = cota completa del marco                               a 90°
luz junto a travesaño  = se descuenta mullionDeduction por lado desde su eje
corredera de n hojas   = ancho nominal (luz + 2·sashOverlap + (n−1)·sashWidth) / n
```

Valores PRO6004: weld 3, frameDeduction 44, sashWidth 80, sashDeduction 60, sashOverlap 8, glassGap 5,
mullionDeduction 20, refuerzo marco = corte − 114, hoja PRO521 = corte − 146, travesaño = largo − 20,
junquillo de hoja PRO02 = nominal − 107 (PRO521 = nominal − 120). PROSLD70: frameDeduction 52.
Puertas Proline: sashWidth 110 / sashDeduction 90 (o 102/82 según producto).

### Precio

```
material = Σ perfiles (largo/barra × precio barra × (1 − desc. perfiles))   ← o barras completas si chargeFullBars
         + Σ refuerzos (idem, desc. refuerzos) + Σ herrajes (desc. herrajes)
         + Σ vidrios (max(área, mínima) × precio m² × (1 − desc. vidrios)) + accesorios
costo    = material × (1 + merma) + mano de obra/m² × área + instalación (si corresponde)
unitario = redondeo_arriba(costo / (1 − margen))   o  costo × (1 + recargo)
total    = Σ unitario × cantidad − descuento + extras ; IVA 19 % sobre el neto total
```
Valores por defecto: margen 40 % sobre venta, mano de obra $12.000/m², instalación desactivada, merma
5 %, redondeo $100, IVA 19 %, barra 5.800 mm, corte de sierra 4 mm, despunte 0. Un ítem con precio $0
o sin precio en catálogo produce un **aviso** («El herraje X no tiene precio: se cotiza en $0»), nunca
un bloqueo.

## 4. Pantallas (web)

Navegación lateral compacta (colapsable) + barra superior con búsqueda/⌘K, avatar de Marco y cuenta.

| Ruta | Pantalla | Clave |
| --- | --- | --- |
| `/` | Landing pública | Hero con mini diseñador interactivo real, documentos de muestra, comparación, 4 planes (mensual/anual), FAQ |
| `/entrar`, `/crear-cuenta`, `/recuperar` | Acceso | Correo + contraseña; crear cuenta pide nombre, empresa, correo, contraseña y entra directo (prueba 14 días) |
| `/bienvenida` | Puesta a punto opcional | 3 pasos saltables: marcas que usas, tu logo/datos, tus precios base. Nunca bloquea |
| `/inicio` | Inicio | Saludo, acciones rápidas, embudo (borradores/enviadas/aceptadas/en taller), vendido del mes, seguimientos pendientes, recientes |
| `/cotizaciones` | Lista | Tabla con estado, cliente, total, fecha; filtros por estado; búsqueda; duplicar |
| `/cotizaciones/:id` | Editor | Ver §5 |
| `/clientes`, `/clientes/:id` | Clientes | Lista + ficha con sus cotizaciones |
| `/taller` | Producción | OT abiertas, tablero por estación (Empresa), acceso a documentos de taller |
| `/taller/:id` | OT | Pestañas: Resumen · Cortes (optimización visual) · Vidrios · Materiales · Montaje · Etiquetas · Compras (Pro) · CNC (Pro) |
| `/catalogo` | Catálogo | Marcas (activar, «Mis precios»), líneas y pautas, perfiles, herrajes, vidrios, colores, importar CSV |
| `/documentos` | Diseños de documentos | Galería de plantillas de cotización (4) y catálogo (3); editor en vivo con textos y opciones |
| `/ajustes/*` | Ajustes | Empresa · Precios · Taller · Equipo (si aplica) · Plan y facturación |
| `/c/:token` | Portal del cliente | Cotización interactiva, ver dibujos (3D si el plan lo incluye), aceptar con nombre, pedir cambios, descargar PDF |

## 5. Editor de cotización (la pantalla más importante)

Tres zonas en escritorio (≥ 1280 px), responsive hasta tablet; en teléfono, lista + hoja inferior.

1. **Columna izquierda (280 px)**: título de obra editable en línea, cliente (combobox con «crear»
   inline), lista de ítems con miniatura dibujada, ref, medidas, cantidad y precio; arrastrar para
   reordenar; botón grande «Agregar ventana» (atajo `A`).
2. **Centro**: segmentado **Diseño | Documento**.
   - *Diseño*: lienzo con la ventana dibujada a escala (SVG del paquete documents), cotas editables con
     clic (input en el lugar), clic en un paño → barra contextual con aperturas (iconos), dividir
     vertical/horizontal, unión francesa, cambiar vidrio; arrastrar travesaños con imán (10/50 mm);
     zoom/encuadre; vista interior/exterior; galería de tipologías al agregar (búsqueda + favoritas) que
     pide ancho × alto en dos inputs grandes y crea con Enter.
   - *Documento*: vista previa en vivo de la cotización con la plantilla elegida, edición directa de
     textos (contentEditable) y selector de plantilla; botones «Descargar PDF», «Copiar enlace»,
     «WhatsApp», «Correo».
3. **Inspector derecho (320 px)**: del ítem seleccionado — línea (por marca), color ext/int con
   muestras, vidrio, cantidad, ambiente, notas, precio manual; desglose «¿De dónde sale el precio?»
   (materiales por familia, merma, mano de obra, margen); avisos con corrección.
4. **Pie fijo**: Neto · Descuento · Extras · IVA · **Total**, m² y unidades; margen real (solo dueño);
   acciones primarias: «Enviar al cliente» y «Pasar a taller».

Deshacer/rehacer global (`Ctrl+Z`/`Ctrl+Shift+Z`) sobre el documento de cotización. Atajos: `A` agregar,
`D` duplicar ítem, `Supr` eliminar (con deshacer), `1–9` seleccionar ítem, `⌘K` comandos.

## 6. Documentos

Todos son componentes React del paquete `documents` con CSS propio de impresión (Carta por defecto, A4
opcional), renderizados igual en pantalla y en PDF (Chromium en el servidor; respaldo: imprimir del navegador).

- **Cotización** — 4 diseños, todos editables (logo, color, tipografía, qué mostrar, textos):
  `esencial` (limpia, una fila por ventana con dibujo grande), `galeria` (tarjetas visuales 2 por fila
  con portada), `compacta` (tabla densa para obras grandes, 1–2 páginas), `editorial` (portada, una
  ventana por página con dibujo protagonista, interior/exterior, cierre con aceptación y firma).
- **Catálogo de productos** — 3 diseños (`vitrina`, `ficha`, `lookbook`): folleto con las líneas y
  tipologías del taller, dibujos y «desde $X/m²».
- **Taller**: OT por ventana (dibujo acotado, cortes, refuerzos, herrajes, vidrio, notas), Optimización
  de cortes (barras dibujadas a escala, medida grande + ítem/lado, color por ventana, aprovechamiento),
  Vidrios (pedido al proveedor con casillas), Materiales (barras por perfil y color, herrajes,
  accesorios, con o sin costos), Montaje (checklist por ventana con firmas), Costos (interno),
  Etiquetas de piezas con QR, Orden de compra por proveedor (Pro), CSV de corte para sierra (Pro).

Deben ser **claramente mejores** que los habituales del rubro (cotas y sumas sin errores, legibles en el
taller, sin códigos internos) y visualmente distintos.

## 7. Marco, el asistente

Mascota basada en el motor de animación de bloub (MIT, conservar aviso en `THIRD_PARTY_NOTICES.md`),
con identidad propia: bola color tinta, ojos-cápsula, estados reposo/escuchando/pensando/trabajando/
listo/aprobación/error. Panel no modal anclado abajo a la derecha. Tono cálido y directo.
Opera la app con las mismas operaciones que la interfaz (crear cotización, agregar/editar ventanas,
cambiar línea/color/vidrio a varias, aplicar descuento, explicar un precio, buscar clientes, abrir
documentos, navegar). Las herramientas se ejecutan en el navegador sobre el estado real (se ve el
cambio, se puede deshacer). Con IA (planes Pro+; API compatible OpenAI configurada por entorno) o en
**modo local** sin IA (intérprete determinista de frases comunes: «agrega una corredera de 1500 x 1200
blanca», «duplica la V2», «descuento 5 %», «cambia todo a nogal») para Taller o si no hay clave.

## 8. Planes y cobro

Ver `packages/shared/src/plans.ts`. Taller 39.990 · Pro 69.990 · Empresa 129.990 · Empresa 2× 149.990
CLP + IVA al mes (anual: 35.990 / 59.990 / 99.990 / 129.990). Prueba 14 días con funciones de Pro y 500
créditos, sin tarjeta. Cobro con Flow.cl (suscripción; firma HMAC-SHA256 del parámetro `s`; confirmación
por callback + consulta de estado). Sin claves configuradas el proveedor `dev` activa el plan al instante
(para desarrollo y demos).

## 9. Calidad

- `npm test` (vitest) verde: motor con casos dorados (orden de trabajo real, plantilla fabricante, corredera PROSLD70,
  optimizador, precio), importador, servidor (auth, aislamiento entre organizaciones, cotizaciones,
  portal, facturación dev), documentos (render sin errores).
- `npm run typecheck` y `npm run build` limpios.
- Prueba de humo e2e con Playwright: crear cuenta → cotización con 3 ventanas → PDF → portal → aceptar → OT.
- Accesible (foco visible, contraste AA, teclado), responsive, `prefers-reduced-motion`.
