import { defineConfig } from 'drizzle-kit'

// Genera migraciones SQL versionadas en ./migrations a partir de src/db/schema.ts.
// Uso: npx drizzle-kit generate --name <cambio>  (el servidor las aplica solo al arrancar).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './migrations',
  strict: true,
})
