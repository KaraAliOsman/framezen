# Framezen

Software para talleres y fábricas de ventanas y puertas de PVC: diseñas una ventana en segundos, ves el
precio al instante, envías una cotización que vende y pasas a taller con cortes optimizados, vidrios,
materiales y montaje. Sin que nada te bloquee.

## Empezar

Requisitos: Node.js 22 o superior y npm.

```bash
npm install
npm run catalog:import      # opcional: genera .data/catalog/base.json desde tus datos de marcas
npm run dev                 # API en :8787 y web en http://localhost:5180
```

Sin `DATABASE_URL`, la API usa PGlite (Postgres embebido) en `.data/pg`: no necesitas Docker ni
instalar nada más. Crea tu cuenta en `/crear-cuenta` y empieza con la prueba de 14 días.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | API y web con recarga en caliente |
| `npm test` | Pruebas (motor, catálogo, documentos, servidor, web) |
| `npm run typecheck` | Tipos de todo el monorepo |
| `npm run build` | Compila web y servidor |
| `npm start` | Sirve la API y la web compilada (producción) |
| `npm run catalog:import -- "<carpeta>"` | Importa marcas, líneas y listas de precios |

## Estructura

```
packages/engine     Motor de cálculo puro: diseño, pauta de cortes, vidrios, herrajes, precio, optimizador
packages/catalog    Catálogo de ejemplo e importador de datos de marcas y listas "MisPrecios"
packages/shared     Contrato de la API y planes
packages/documents  Dibujo de ventanas y todos los documentos (cotizaciones, catálogo, taller)
apps/server         API (Hono + Drizzle; PGlite o Postgres) y generación de PDF
apps/web            Aplicación web (React + Vite + Tailwind)
docs/               Especificación (SPEC.md) y sistema de diseño (DESIGN.md)
```

## Datos de marcas

El repositorio es público, así que los datos de marcas y listas de precios no se incluyen. El importador
los lee desde `CATALOG_SOURCE_DIR` y genera `.data/catalog/base.json` (o la ruta de `CATALOG_SOURCE_JSON`),
que la API siembra al arrancar. Si el archivo cambia (por ejemplo, al volver a correr el importador), la API
carga la versión nueva sola, sin reiniciar y sin tocar lo de cada taller: marcas activas, precios propios,
pautas ajustadas y áreas mínimas de vidrio se mantienen. Sin ese archivo se usa un catálogo de ejemplo
propio. También puedes importar un CSV "MisPrecios" desde **Catálogo → Importar precios** (con vista previa
antes de guardar).

Al crear una cuenta quedan listos valores sensatos para cotizar con un Enter: la línea practicable más
completa (PRO6004 de Proline si está en el catálogo), color Blanco y vidrio DVH 4+12+4 incoloro (o el DVH
incoloro más común), con las marcas de datos más completos activas. Todo se cambia después; nada es
obligatorio.

## Variables de entorno

Todas están en la tabla de abajo; defínelas en el entorno del proceso. En desarrollo ninguna es obligatoria.
Nunca subas archivos `.env*` (git los ignora en todas las carpetas).

| Variable | Para qué |
| --- | --- |
| `APP_URL` | URL pública (portal del cliente, correos, retorno de pagos). Obligatoria en producción |
| `PORT` | Puerto de la API (8787 en desarrollo, 8080 en el contenedor) |
| `DATABASE_URL` | Postgres. Sin ella, PGlite en `PGLITE_DIR` (por defecto `.data/pg`) |
| `PGLITE_DIR` | Carpeta de PGlite (un solo proceso por carpeta) |
| `MIGRATIONS_DIR` | Carpeta de migraciones SQL (por defecto la del servidor o la del bundle) |
| `WEB_DIST` | Web compilada que sirve `npm start` (por defecto `apps/web/dist`) |
| `CATALOG_SOURCE_DIR` | Carpeta con los datos de marcas para `npm run catalog:import` |
| `CATALOG_SOURCE_JSON` | Catálogo generado que siembra la API (por defecto `.data/catalog/base.json`) |
| `CHROMIUM_PATH` | Chromium propio para los PDF (si no, el de Playwright) |
| `PDF_TIMEOUT_MS` | Tiempo máximo por PDF (por defecto 30000) |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | Marco con IA (API compatible con OpenAI; `AI_BASE_URL` incluye `/v1`, p. ej. `https://api.openai.com/v1`). Sin ellas, modo local |
| `AI_TIMEOUT_MS` | Tiempo máximo por respuesta de la IA (por defecto 25000) |
| `FLOW_API_KEY`, `FLOW_SECRET_KEY` | Cobros con Flow.cl. Sin ellas, el proveedor `dev` activa los planes al instante |
| `FLOW_API_URL` | `https://www.flow.cl/api` en producción; sandbox: `https://sandbox.flow.cl/api` |
| `RESEND_API_KEY`, `MAIL_FROM` | Correo transaccional. Sin clave, los enlaces salen por la consola |
| `SESSION_SECRET` | Reservado para firmar enlaces (genera uno largo y aleatorio) |
| `TRUST_PROXY_HOPS` | Proxies de confianza que agregan la IP real al final de `X-Forwarded-For` (por defecto 1 en producción, 0 en desarrollo; usa 0 si no hay ningún proxy delante del servidor) |
| `SIGNUP_LIMIT_PER_HOUR` | Cuentas nuevas por IP y hora (por defecto 10 en producción, 200 en desarrollo) |
| `ALLOW_DEV_BILLING`, `ALLOW_HTTP_APP_URL`, `MAIL_TO_CONSOLE` | Solo para demos: en producción el servidor no arranca sin claves de Flow, con `APP_URL` sin https o sin `RESEND_API_KEY`, salvo que lo permitas explícitamente con `=1` |

## Producción

Un solo contenedor (`Dockerfile`) con la API, la web compilada y Chromium para los PDF (imagen oficial de
Playwright, misma versión que `playwright-core`). El build compila la web (`apps/web/dist`) y el servidor
(`apps/server/dist`, con las migraciones SQL en `dist/migrations`, que se aplican solas al arrancar), y
`npm start` sirve `/api` y la web con fallback SPA en `$PORT`.

```bash
docker build -t framezen .
# demo local (sin https, sin cobros reales y sin correo: cada atajo se pide de forma explícita)
docker run -p 8080:8080 -e APP_URL=http://localhost:8080 -e ALLOW_HTTP_APP_URL=1 -e ALLOW_DEV_BILLING=1 -e MAIL_TO_CONSOLE=1 framezen
```

Configura al menos `APP_URL` (https), `DATABASE_URL`, `FLOW_API_KEY`/`FLOW_SECRET_KEY` y `RESEND_API_KEY`
(sin `DATABASE_URL` el contenedor usa PGlite en un disco efímero). Si falta alguno, el servidor no arranca
en producción: así nunca queda activando planes gratis, con la cookie sin `Secure` ni con enlaces secretos en
el log. La IA es opcional. Para usar tu catálogo de marcas, móntalo en un volumen y
apunta `CATALOG_SOURCE_JSON` a ese archivo. `railway.toml` está listo para Railway (healthcheck en
`/api/health`).

Sin Docker: `npm ci && npm run build && NODE_ENV=production npm start`.

## Licencia y avisos

Código propietario de Framezen. Componentes de terceros en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
