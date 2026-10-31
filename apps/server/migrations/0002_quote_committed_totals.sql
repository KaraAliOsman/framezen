ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "sent_total" bigint;
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "accepted_total" bigint;
--> statement-breakpoint
UPDATE "quotes" AS q SET "sent_total" = round((r."snapshot"->'totals'->>'total')::numeric)::bigint
FROM "quote_revisions" AS r
WHERE r."quote_id" = q."id" AND r."revision" = q."revision" AND q."revision" > 0 AND q."sent_total" IS NULL
  AND jsonb_typeof(r."snapshot"->'totals'->'total') = 'number';
--> statement-breakpoint
UPDATE "quotes" AS q SET "accepted_total" = round((r."snapshot"->'totals'->>'total')::numeric)::bigint
FROM "quote_revisions" AS r
WHERE r."quote_id" = q."id" AND r."revision" = q."accepted_revision" AND q."accepted_total" IS NULL
  AND jsonb_typeof(r."snapshot"->'totals'->'total') = 'number';
