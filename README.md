# DEKOPEN

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

Todas están en la tabla de abajo; defínelas en el entorno del proceso o en un `.env` en la raíz, que se carga al
arrancar sin pisar las variables reales. En desarrollo ninguna es obligatoria. Nunca subas archivos `.env*` (git los
ignora en todas las carpetas).

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
| `AI_API_KEY` | Clave del proveedor de IA (ver [Conectar la IA](#conectar-la-ia)). Sin clave, los asistentes funcionan solo con comandos locales (gratis) |
| `AI_BASE_URL`, `AI_MODEL` | Dirección de cualquier API compatible con OpenAI (termina en `/v1`) y modelo. Obligatorias si hay clave |
| `AI_VISION_MODEL` | Modelo para imágenes (por defecto, `AI_MODEL`) |
| `AI_MAX_COMPLETION_TOKENS`, `AI_THINKING` | Tope de salida por respuesta (mínimo 4096) y razonamiento de las llamadas auxiliares (`disabled` por defecto). El agente razona siempre, con el nivel que elige cada persona; `AGENT_THINKING=disabled` lo apaga para modelos sin razonamiento y `AI_LEARNING=disabled` apaga el aprendizaje automático |
| `AI_TIMEOUT_MS`, `AI_MAX_DURATION_MS` | Tiempo máximo sin recibir datos de la IA (por defecto 45000) y duración máxima de una respuesta (por defecto 240000) |
| `FLOW_API_KEY`, `FLOW_SECRET_KEY` | Cobros con Flow.cl. Sin ellas, el proveedor `dev` activa los planes al instante |
| `FLOW_API_URL` | `https://www.flow.cl/api` en producción; sandbox: `https://sandbox.flow.cl/api` |
| `PAYMENT_KEYS_SECRET` | Clave maestra (32 caracteres o más) para cifrar las llaves de Flow de cada taller. Sin ella, ese cobro queda apagado. Si cambia, cada taller debe volver a conectar su cuenta |
| `RESEND_API_KEY`, `MAIL_FROM` | Correo transaccional. Sin clave, los enlaces salen por la consola |
| `SESSION_SECRET` | Reservado para firmar enlaces (genera uno largo y aleatorio) |
| `TRUST_PROXY_HOPS` | Proxies de confianza que agregan la IP real al final de `X-Forwarded-For` (por defecto 1 en producción, 0 en desarrollo; usa 0 si no hay ningún proxy delante del servidor) |
| `SIGNUP_LIMIT_PER_HOUR` | Cuentas nuevas por IP y hora (por defecto 10 en producción, 200 en desarrollo) |
| `ALLOW_DEV_BILLING`, `ALLOW_HTTP_APP_URL`, `MAIL_TO_CONSOLE` | Solo para demos: en producción el servidor no arranca sin claves de Flow, con `APP_URL` sin https o sin `RESEND_API_KEY`, salvo que lo permitas explícitamente con `=1` |

## Conectar la IA

Sin clave todo funciona con comandos locales. Para la IA sirve cualquier API compatible con OpenAI: hacen falta su
dirección, una clave y un modelo que acepte herramientas. El servidor pide el uso de tokens en streaming y, si un
proveedor rechaza un parámetro opcional, lo quita solo.

Si el proveedor es Xiaomi MiMo, la clave debe ser de pago por uso (`sk-…`): las de Token Plan (`tp-…`) no se pueden
usar en un backend y la app las rechaza. Solo con ese proveedor se consulta su saldo sin costo.

### En desarrollo

```bash
npm run ai:setup              # pide dirección, clave (sin mostrarla) y modelo, los guarda en .env y comprueba la conexión
npm run ai:check -- --full    # opcional: prueba herramientas, razonamiento, JSON e imagen (unos cientos de tokens)
npm run dev                   # si ya estaba corriendo, se reinicia solo al cambiar .env
```

`ai:setup` cambia solo `AI_BASE_URL`, `AI_MODEL` y `AI_API_KEY` en `.env` y deja el resto intacto. El archivo está en la raíz, git lo
ignora y lo carga el servidor al arrancar, aunque el cwd sea `apps/server`. Una variable real del entorno siempre
gana sobre `.env`.

`npm run ai:check` hace una llamada mínima y responde uno de estos estados:

| Estado | Qué hacer |
| --- | --- |
| Conectado (modelo y latencia) | Nada |
| Sin clave | `npm run ai:setup` |
| Clave rechazada | Copia de nuevo la clave o crea otra |
| Sin saldo | Recarga en la consola del proveedor |
| Modelo no disponible | Revisa `AI_MODEL` y `AI_VISION_MODEL`: el proveedor debe ofrecerlos |
| Configuración inválida | Revisa `AI_BASE_URL` (termina en `/v1`) y `AI_MODEL` |
| Token Plan no apto | Solo con MiMo: crea una clave de pago por uso (`sk-…`) |
| Sin red | Revisa internet, proxy o firewall |
| Clave o región bloqueada | Crea otra clave; si sigue, prueba otra región del servidor |
| Proveedor saturado | Espera unos minutos |

Para trabajar sin clave real hay un proveedor simulado, con fallos a pedido (detalle en el archivo):

```bash
FAKE_AI_PORT=8917 node scripts/fake-ai.mjs
AI_BASE_URL=http://localhost:8917/v1 AI_MODEL=simulado AI_API_KEY=sk-simulada npm run dev
```

### En producción (Railway)

En producción no se usa `.env`: la clave va en las variables del servicio.

1. En Railway, abre el servicio, ve a **Variables** y agrega `AI_BASE_URL`, `AI_MODEL` y `AI_API_KEY`. Nada más es obligatorio.
2. Railway vuelve a desplegar solo. El log de arranque debe decir `IA: clave configurada`.
3. Entra a la app, ve a **Ajustes, IA** y usa **Comprobar ahora**. Es el mismo diagnóstico de `ai:check`, con una
   llamada real mínima. Lo ven solo quienes administran la cuenta y nunca muestra la clave ni el saldo.

También puedes comprobarlo desde tu equipo con las variables de Railway:

```bash
railway run npm run ai:check -- --full
```

## Producción

Un solo contenedor (`Dockerfile`) con la API, la web compilada y Chromium para los PDF (imagen oficial de
Playwright, misma versión que `playwright-core`). El build compila la web (`apps/web/dist`) y el servidor
(`apps/server/dist`, con las migraciones SQL en `dist/migrations`, que se aplican solas al arrancar), y
`npm start` sirve `/api` y la web con fallback SPA en `$PORT`.

```bash
docker build -t dekopen .
# demo local (sin https, sin cobros reales y sin correo: cada atajo se pide de forma explícita)
docker run -p 8080:8080 -e APP_URL=http://localhost:8080 -e ALLOW_HTTP_APP_URL=1 -e ALLOW_DEV_BILLING=1 -e MAIL_TO_CONSOLE=1 dekopen
```

Configura al menos `APP_URL` (https), `DATABASE_URL`, `FLOW_API_KEY`/`FLOW_SECRET_KEY` y `RESEND_API_KEY`
(sin `DATABASE_URL` el contenedor usa PGlite en un disco efímero). Si falta alguno, el servidor no arranca
en producción: así nunca queda activando planes gratis, con la cookie sin `Secure` ni con enlaces secretos en
el log. La IA es opcional. Para usar tu catálogo de marcas, móntalo en un volumen y
apunta `CATALOG_SOURCE_JSON` a ese archivo. `railway.toml` está listo para Railway (healthcheck en
`/api/health`).

Sin Docker: `npm ci && npm run build && NODE_ENV=production npm start`.

## Licencia y avisos

Código propietario de DEKOPEN. Componentes de terceros en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
