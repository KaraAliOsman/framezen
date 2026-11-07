-- Plantillas de documentos propias de cada organización (cotización y catálogo). `spec` es el
-- DocTemplate versionado de @dekopen/shared/templates (JSON declarativo validado con zod: nunca
-- HTML, CSS, JS ni URLs). `preset_id` recuerda de qué diseño predefinido se duplicó; `version` es
-- el control optimista del editor; borrado suave para poder deshacer.
CREATE TABLE IF NOT EXISTS "document_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"preset_id" text,
	"spec" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "document_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "document_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "document_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "document_templates_kind_check" CHECK ("kind" IN ('quote', 'catalog'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_templates_org_kind_idx" ON "document_templates" USING btree ("org_id","kind","updated_at");
