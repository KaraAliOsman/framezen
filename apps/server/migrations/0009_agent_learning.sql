ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "learned_seq" integer NOT NULL DEFAULT 0;
