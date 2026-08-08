CREATE TYPE "public"."bug_severity" AS ENUM('low', 'medium', 'high', 'critical');
--> statement-breakpoint
CREATE TYPE "public"."bug_status" AS ENUM('open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed');
--> statement-breakpoint
CREATE TYPE "public"."roadmap_phase" AS ENUM('now', 'next', 'later');
--> statement-breakpoint
CREATE TYPE "public"."roadmap_priority" AS ENUM('low', 'medium', 'high');
--> statement-breakpoint
CREATE TYPE "public"."roadmap_status" AS ENUM('planned', 'building', 'blocked', 'shipped');
--> statement-breakpoint
CREATE TABLE "bug" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"severity" "bug_severity" DEFAULT 'medium' NOT NULL,
	"status" "bug_status" DEFAULT 'open' NOT NULL,
	"resolution_notes" text DEFAULT '' NOT NULL,
	"linked_task_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"code_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_lineage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmap_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"phase" "roadmap_phase" DEFAULT 'next' NOT NULL,
	"priority" "roadmap_priority" DEFAULT 'medium' NOT NULL,
	"status" "roadmap_status" DEFAULT 'planned' NOT NULL,
	"linked_task_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bug_workspace_id_id_uidx" ON "bug" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "roadmap_item_workspace_id_id_uidx" ON "roadmap_item" USING btree ("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "bug" ADD CONSTRAINT "bug_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bug" ADD CONSTRAINT "bug_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "roadmap_item" ADD CONSTRAINT "roadmap_item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "roadmap_item" ADD CONSTRAINT "roadmap_item_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "bug_workspace_status_severity_updated_idx" ON "bug" USING btree ("workspace_id","status","severity","updated_at");
--> statement-breakpoint
CREATE INDEX "roadmap_item_workspace_phase_status_idx" ON "roadmap_item" USING btree ("workspace_id","phase","status","updated_at");
