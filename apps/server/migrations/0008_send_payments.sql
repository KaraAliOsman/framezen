ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "sent_format" text;
--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD COLUMN IF NOT EXISTS "pdf_downloaded_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_payments" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "quote_id" text NOT NULL REFERENCES "quotes"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "amount" bigint NOT NULL,
  "method" text NOT NULL,
  "status" text NOT NULL DEFAULT 'received',
  "reference" text,
  "provider_order" text,
  "paid_at" timestamp with time zone,
  "recorded_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_payments_quote_idx" ON "quote_payments" ("quote_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quote_payments_provider_order_uq" ON "quote_payments" ("org_id", "provider_order");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_payment_keys" (
  "org_id" text PRIMARY KEY NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "api_key" text NOT NULL,
  "secret_key" text NOT NULL,
  "sandbox" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
