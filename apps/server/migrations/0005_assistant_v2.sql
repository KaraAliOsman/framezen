-- Asistente v2: varios asistentes por organización, conversaciones del lado del servidor,
-- memoria con alcance (asistente / persona / empresa) y registro de herramientas (tool_runs) con
-- aprobación, ejecución y deshacer. Todo lleva org_id y se filtra siempre por la organización.
CREATE TABLE IF NOT EXISTS "assistants" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"owner_user_id" text,
	"name" text NOT NULL,
	"avatar" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"personality" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_mode" text DEFAULT 'supervised' NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text DEFAULT 'auto' NOT NULL,
	"memory_enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "assistants_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "assistants_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "assistants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "assistants_default_mode_check" CHECK ("default_mode" IN ('chat', 'supervised', 'full'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistants_org_owner_idx" ON "assistants" USING btree ("org_id","owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistants_org_created_idx" ON "assistants" USING btree ("org_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"assistant_id" text,
	"title" text DEFAULT '' NOT NULL,
	"title_source" text DEFAULT 'auto' NOT NULL,
	"mode" text DEFAULT 'supervised' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "conversations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "conversations_assistant_id_assistants_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistants"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "conversations_mode_check" CHECK ("mode" IN ('chat', 'supervised', 'full'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_org_user_last_idx" ON "conversations" USING btree ("org_id","user_id","last_message_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_org_assistant_idx" ON "conversations" USING btree ("org_id","assistant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"reasoning" text,
	"tool_calls" jsonb,
	"tool_call_id" text,
	"model" text,
	"credits" integer DEFAULT 0 NOT NULL,
	"tokens_in" integer,
	"tokens_cached" integer,
	"tokens_out" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "messages_role_check" CHECK ("role" IN ('user', 'assistant', 'tool', 'system_note'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_conversation_seq_uq" ON "messages" USING btree ("conversation_id","seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_org_conversation_seq_idx" ON "messages" USING btree ("org_id","conversation_id","seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_org_created_idx" ON "messages" USING btree ("org_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memories" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"scope" text NOT NULL,
	"user_id" text,
	"assistant_id" text,
	"kind" text DEFAULT 'fact' NOT NULL,
	"content" text NOT NULL,
	"source" text DEFAULT 'explicit' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"source_message_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "memories_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "memories_assistant_id_assistants_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistants"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "memories_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "memories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "memories_scope_check" CHECK ("scope" IN ('assistant', 'user', 'org')),
	CONSTRAINT "memories_source_check" CHECK ("source" IN ('explicit', 'auto'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_org_scope_user_idx" ON "memories" USING btree ("org_id","scope","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_org_assistant_idx" ON "memories" USING btree ("org_id","assistant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"assistant_id" text,
	"conversation_id" text,
	"message_id" text,
	"tool_call_id" text NOT NULL,
	"tool" text NOT NULL,
	"risk" text NOT NULL,
	"mode" text NOT NULL,
	"executor" text DEFAULT 'server' NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"args_hash" text NOT NULL,
	"preview" jsonb,
	"result" jsonb,
	"error" jsonb,
	"undo" jsonb,
	"affected" jsonb,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_runs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "tool_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "tool_runs_assistant_id_assistants_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistants"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "tool_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "tool_runs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "tool_runs_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "tool_runs_risk_check" CHECK ("risk" IN ('read', 'write', 'external', 'production', 'destructive')),
	CONSTRAINT "tool_runs_status_check" CHECK ("status" IN ('proposed', 'approved', 'rejected', 'executed', 'failed', 'undone', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tool_runs_org_tool_call_uq" ON "tool_runs" USING btree ("org_id","tool_call_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_runs_org_conversation_idx" ON "tool_runs" USING btree ("org_id","conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_runs_org_status_idx" ON "tool_runs" USING btree ("org_id","status","created_at");
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "conversation_id" text CONSTRAINT "ai_usage_conversation_id_conversations_id_fk" REFERENCES "public"."conversations"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "assistant_id" text CONSTRAINT "ai_usage_assistant_id_assistants_id_fk" REFERENCES "public"."assistants"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "tokens_in" integer;
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "tokens_cached" integer;
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "tokens_out" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_org_user_created_idx" ON "ai_usage" USING btree ("org_id","user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_org_conversation_idx" ON "ai_usage" USING btree ("org_id","conversation_id");
