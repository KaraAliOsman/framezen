-- Idioma y moneda (DEKOPEN v5). users.locale NULL = sigue el idioma del navegador o el de la empresa.
-- orgs.locale es el idioma por defecto de los documentos (PDF, portal, correos al cliente) y
-- orgs.currency la moneda ISO 4217 de los precios. El idioma de cada cotización vive en su JSON
-- (quotes.data → documentOverrides.locale), así que no necesita columna propia.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "locale" text DEFAULT 'es' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'CLP' NOT NULL;
