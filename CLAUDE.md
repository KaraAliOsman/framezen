# Comprobar el trabajo
- Tipos: `npm run typecheck` (~1 min, todo el monorepo)
- Pruebas: `npm test`; una carpeta o archivo: `npx vitest run packages/engine` / `npx vitest run <ruta>`
- E2E: necesitan `npm run dev` ya corriendo (no levantan servidor): `npx playwright test -c e2e <archivo>`
- Ver un cambio de UI: preview `web` de `.claude/launch.json` (API en :8787, web en :5180)

# Cosas que el código no dice
- El producto se llama DEKOPEN (paquetes `@dekopen/*`). "Framezen" es el nombre viejo (carpeta, commits antiguos, datos guardados que `catalog/model/labels.ts` migra); no lo uses en código ni textos nuevos.
- El repo es PÚBLICO. Nada de precios, cifras del negocio, datos de marcas ni menciones a la competencia en archivos versionados. `docs/research/` y `docs/build/` son locales (gitignored) y sí pueden tener eso; `test/repo-public.test.ts` vigila parte de esta regla.
- PGlite (`.data/pg`) admite un solo proceso por carpeta: no arranques una segunda API sobre la misma carpeta mientras corre `npm run dev`.
- `.env*` está bloqueado para lectura; la referencia de variables es la tabla del README.
