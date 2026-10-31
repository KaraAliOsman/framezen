CREATE TABLE IF NOT EXISTS "billing_accounts" (
	"org_id" text PRIMARY KEY NOT NULL,
	"pending_plan" text,
	"pending_period" text,
	"pending_subscription_id" text,
	"credit_balance" integer DEFAULT 0 NOT NULL,
	"card_brand" text,
	"card_last4" text,
	"synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_accounts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_checkouts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"provider" text NOT NULL,
	"plan" text NOT NULL,
	"period" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"credit" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text,
	"flow_order" text,
	"meta" jsonb,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_checkouts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "billing_checkouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_checkouts_token_uq" ON "billing_checkouts" USING btree ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_checkouts_org_idx" ON "billing_checkouts" USING btree ("org_id","created_at");
