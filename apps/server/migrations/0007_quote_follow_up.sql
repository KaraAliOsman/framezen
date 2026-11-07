ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "follow_up_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "lost_reason" text;
