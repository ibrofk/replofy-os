CREATE TYPE "public"."account_status" AS ENUM('prospect', 'customer', 'partner', 'inactive');
--> statement-breakpoint
CREATE TYPE "public"."lead_priority" AS ENUM('low', 'medium', 'high');
--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other');
--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost');
--> statement-breakpoint
CREATE TABLE "growth_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"size" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" "account_status" DEFAULT 'prospect' NOT NULL,
	"source_lineage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"company_name" text DEFAULT '' NOT NULL,
	"account_id" uuid,
	"source" "lead_source" DEFAULT 'inbound' NOT NULL,
	"stage" "lead_stage" DEFAULT 'new' NOT NULL,
	"priority" "lead_priority" DEFAULT 'medium' NOT NULL,
	"owner_user_id" text,
	"next_action" text DEFAULT '' NOT NULL,
	"next_action_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"linked_task_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"source_lineage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_workspace_id_id_uidx" ON "growth_account" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "lead_workspace_id_id_uidx" ON "lead" USING btree ("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "growth_account" ADD CONSTRAINT "growth_account_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "growth_account" ADD CONSTRAINT "account_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_account_id_growth_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."growth_account"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "account_workspace_status_updated_idx" ON "growth_account" USING btree ("workspace_id","status","updated_at");
--> statement-breakpoint
CREATE INDEX "lead_workspace_stage_priority_updated_idx" ON "lead" USING btree ("workspace_id","stage","priority","updated_at");
--> statement-breakpoint
CREATE INDEX "lead_workspace_account_idx" ON "lead" USING btree ("workspace_id","account_id");
