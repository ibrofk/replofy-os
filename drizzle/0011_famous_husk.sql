CREATE TYPE "public"."business_plan_link_type" AS ENUM('task', 'cycleGoal', 'vision', 'blogArticle', 'contextSource', 'apiEndpoint', 'feedback', 'socialPost', 'prompt', 'timeBlock', 'environment', 'teamMember');--> statement-breakpoint
CREATE TYPE "public"."business_plan_status" AS ENUM('draft', 'review', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."context_source_content_storage" AS ENUM('full', 'preview-only');--> statement-breakpoint
CREATE TYPE "public"."context_source_item_status" AS ENUM('proposed', 'accepted', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."context_source_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."context_source_version_status" AS ENUM('processed', 'error');--> statement-breakpoint
CREATE TABLE "business_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" "business_plan_status" DEFAULT 'draft' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_revision" integer DEFAULT 0 NOT NULL,
	"block_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_plan_editing_session" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"color" text NOT NULL,
	"active_block_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_key" text NOT NULL,
	"latest_version" integer DEFAULT 0 NOT NULL,
	"latest_file_name" text DEFAULT '' NOT NULL,
	"latest_mime_type" text DEFAULT 'text/plain' NOT NULL,
	"latest_summary" text DEFAULT '' NOT NULL,
	"linked_task_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_vision_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_cycle_goal_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_feedback_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_social_post_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_creative_item_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_lead_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_account_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_user_id" text NOT NULL,
	"last_uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "context_source_status" DEFAULT 'active' NOT NULL,
	"folder_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_source_folder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_source_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "context_source_item_status" DEFAULT 'proposed' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_source_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"version" integer NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_hash" text NOT NULL,
	"content_preview" text DEFAULT '' NOT NULL,
	"full_content" text,
	"content_storage" "context_source_content_storage" DEFAULT 'preview-only' NOT NULL,
	"routing_content_available" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"linked_task_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_vision_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_cycle_goal_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_feedback_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_social_post_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_creative_item_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_lead_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"linked_account_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_user_id" text NOT NULL,
	"status" "context_source_version_status" DEFAULT 'processed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "context_source_version_file_size_positive" CHECK ("context_source_version"."file_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "business_plan" ADD CONSTRAINT "business_plan_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_plan" ADD CONSTRAINT "business_plan_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_plan_editing_session" ADD CONSTRAINT "business_plan_editing_session_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_plan_editing_session" ADD CONSTRAINT "business_plan_editing_session_plan_fk" FOREIGN KEY ("workspace_id","plan_id") REFERENCES "public"."business_plan"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_plan_editing_session" ADD CONSTRAINT "business_plan_editing_session_user_membership_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source" ADD CONSTRAINT "context_source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source" ADD CONSTRAINT "context_source_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source" ADD CONSTRAINT "context_source_folder_fk" FOREIGN KEY ("workspace_id","folder_id") REFERENCES "public"."context_source_folder"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source_folder" ADD CONSTRAINT "context_source_folder_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source_folder" ADD CONSTRAINT "context_source_folder_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source_item" ADD CONSTRAINT "context_source_item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source_item" ADD CONSTRAINT "context_source_item_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."context_source"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source_item" ADD CONSTRAINT "context_source_item_version_fk" FOREIGN KEY ("workspace_id","source_version_id") REFERENCES "public"."context_source_version"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source_item" ADD CONSTRAINT "context_source_item_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source_version" ADD CONSTRAINT "context_source_version_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source_version" ADD CONSTRAINT "context_source_version_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."context_source"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_source_version" ADD CONSTRAINT "context_source_version_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_plan_workspace_id_id_uidx" ON "business_plan" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "business_plan_workspace_status_updated_idx" ON "business_plan" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "business_plan_editing_session_workspace_id_id_uidx" ON "business_plan_editing_session" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "business_plan_editing_session_workspace_plan_updated_idx" ON "business_plan_editing_session" USING btree ("workspace_id","plan_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "context_source_workspace_source_key_uidx" ON "context_source" USING btree ("workspace_id","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "context_source_workspace_id_id_uidx" ON "context_source" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "context_source_workspace_status_updated_idx" ON "context_source" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "context_source_workspace_folder_idx" ON "context_source" USING btree ("workspace_id","folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "context_source_folder_workspace_name_uidx" ON "context_source_folder" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "context_source_item_workspace_id_id_uidx" ON "context_source_item" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "context_source_item_workspace_source_created_idx" ON "context_source_item" USING btree ("workspace_id","source_id","created_at");--> statement-breakpoint
CREATE INDEX "context_source_item_workspace_status_updated_idx" ON "context_source_item" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "context_source_version_workspace_source_version_uidx" ON "context_source_version" USING btree ("workspace_id","source_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "context_source_version_workspace_id_id_uidx" ON "context_source_version" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "context_source_version_workspace_source_created_idx" ON "context_source_version" USING btree ("workspace_id","source_id","created_at");