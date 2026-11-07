-- Archivos binarios por organización (texturas subidas, miniaturas, imágenes de documentos, avatares).
-- Se guardan en Postgres (bytea): sobreviven al contenedor efímero y viajan con los respaldos.
-- Deduplicación por (org_id, kind, sha256); borrado suave (deleted_at) para poder deshacer.
CREATE TABLE IF NOT EXISTS "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"mime" text NOT NULL,
	"bytes" bytea NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parent_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assets_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "assets_parent_id_assets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "assets_byte_size_check" CHECK ("byte_size" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assets_org_kind_sha_uq" ON "assets" USING btree ("org_id","kind","sha256");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_org_kind_created_idx" ON "assets" USING btree ("org_id","kind","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_org_parent_idx" ON "assets" USING btree ("org_id","parent_id");
