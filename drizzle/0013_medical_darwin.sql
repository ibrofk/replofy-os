CREATE TYPE "public"."ai_action_operation" AS ENUM('create', 'update', 'draft', 'link', 'comment', 'remember', 'archive');--> statement-breakpoint
CREATE TYPE "public"."ai_agent_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ai_chat_message_role" AS ENUM('user', 'assistant', 'tool', 'system');--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_job_type" AS ENUM('analyze_source', 'generate_proposal', 'apply_memory_mutations', 'index_memory', 'reindex_workspace');--> statement-breakpoint
CREATE TYPE "public"."ai_memory_revision_operation" AS ENUM('create', 'update', 'merge', 'expire', 'archive', 'restore');--> statement-breakpoint
CREATE TYPE "public"."ai_proposal_action_status" AS ENUM('pending', 'approved', 'rejected', 'applied', 'conflict', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_proposal_status" AS ENUM('pending_review', 'partially_approved', 'applied', 'rejected', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('gemini', 'openai', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_run_surface" AS ENUM('chat', 'analyze', 'inline', 'operator', 'system');--> statement-breakpoint
CREATE TABLE "ai_agent_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"mission" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"allowed_resource_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"provider" "ai_provider",
	"model" text,
	"status" "ai_agent_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "ai_chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"structured_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_run_id" uuid,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_chat_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text DEFAULT 'New AI conversation' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid,
	"type" "ai_job_type" NOT NULL,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid,
	"surface" "ai_run_surface" NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"assumptions" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "ai_proposal_status" DEFAULT 'pending_review' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_proposal_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"operation" "ai_action_operation" NOT NULL,
	"resource_type" text NOT NULL,
	"target_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"confidence" "operator_memory_confidence" DEFAULT 'medium' NOT NULL,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"status" "ai_proposal_action_status" DEFAULT 'pending' NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"label" text DEFAULT 'Workspace key' NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_error" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"surface" "ai_run_surface" NOT NULL,
	"status" "ai_run_status" DEFAULT 'queued' NOT NULL,
	"provider" "ai_provider",
	"model" text,
	"agent_profile_id" uuid,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context_digest" text,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_source_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"run_id" uuid,
	"content_hash" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"analysis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_workspace_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"default_provider" "ai_provider",
	"default_model" text,
	"fallback_enabled" boolean DEFAULT false NOT NULL,
	"memory_service_url" text,
	"memory_service_status" text DEFAULT 'not_configured' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_memory_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"ai_run_id" uuid,
	"operation" "ai_memory_revision_operation" NOT NULL,
	"before_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependency" (
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependency_workspace_id_task_id_depends_on_task_id_pk" PRIMARY KEY("workspace_id","task_id","depends_on_task_id"),
	CONSTRAINT "task_dependency_no_self_check" CHECK ("task_dependency"."task_id" <> "task_dependency"."depends_on_task_id")
);
--> statement-breakpoint
ALTER TABLE "cycle_goal" ADD COLUMN "outcome" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cycle_goal" ADD COLUMN "success_criteria" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cycle_goal" ADD COLUMN "target_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "acceptance_criteria" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "plan_order" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_profile_workspace_id_id_uidx" ON "ai_agent_profile" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "ai_agent_profile" ADD CONSTRAINT "ai_agent_profile_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_profile" ADD CONSTRAINT "ai_agent_profile_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_message" ADD CONSTRAINT "ai_chat_message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_message" ADD CONSTRAINT "ai_chat_message_session_id_ai_chat_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_chat_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_message" ADD CONSTRAINT "ai_chat_message_ai_run_id_ai_run_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_session" ADD CONSTRAINT "ai_chat_session_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_session" ADD CONSTRAINT "ai_chat_session_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_run_id_ai_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal" ADD CONSTRAINT "ai_proposal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal" ADD CONSTRAINT "ai_proposal_run_id_ai_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal_action" ADD CONSTRAINT "ai_proposal_action_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposal_action" ADD CONSTRAINT "ai_proposal_action_proposal_id_ai_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."ai_proposal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_credential" ADD CONSTRAINT "ai_provider_credential_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_credential" ADD CONSTRAINT "ai_provider_credential_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run" ADD CONSTRAINT "ai_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run" ADD CONSTRAINT "ai_run_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run" ADD CONSTRAINT "ai_run_agent_profile_workspace_fk" FOREIGN KEY ("workspace_id","agent_profile_id") REFERENCES "public"."ai_agent_profile"("workspace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_source_analysis" ADD CONSTRAINT "ai_source_analysis_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_source_analysis" ADD CONSTRAINT "ai_source_analysis_run_id_ai_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace_settings" ADD CONSTRAINT "ai_workspace_settings_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace_settings" ADD CONSTRAINT "ai_workspace_settings_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_memory_revision" ADD CONSTRAINT "operator_memory_revision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_memory_revision" ADD CONSTRAINT "operator_memory_revision_ai_run_id_ai_run_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_profile_workspace_slug_uidx" ON "ai_agent_profile" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "ai_agent_profile_workspace_status_idx" ON "ai_agent_profile" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "ai_chat_message_session_created_idx" ON "ai_chat_message" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_chat_session_workspace_created_idx" ON "ai_chat_session" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_job_workspace_idempotency_uidx" ON "ai_job" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_job_queue_idx" ON "ai_job" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "ai_job_workspace_status_idx" ON "ai_job" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "ai_proposal_workspace_status_idx" ON "ai_proposal" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "ai_proposal_workspace_created_idx" ON "ai_proposal" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_proposal_action_workspace_status_idx" ON "ai_proposal_action" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "ai_proposal_action_proposal_idx" ON "ai_proposal_action" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_credential_workspace_provider_uidx" ON "ai_provider_credential" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE INDEX "ai_provider_credential_workspace_idx" ON "ai_provider_credential" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ai_run_workspace_created_idx" ON "ai_run" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_run_workspace_status_idx" ON "ai_run" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_source_analysis_workspace_version_uidx" ON "ai_source_analysis" USING btree ("workspace_id","source_version_id");--> statement-breakpoint
CREATE INDEX "ai_source_analysis_workspace_source_idx" ON "ai_source_analysis" USING btree ("workspace_id","source_id");--> statement-breakpoint
CREATE INDEX "operator_memory_revision_workspace_memory_idx" ON "operator_memory_revision" USING btree ("workspace_id","memory_id","created_at");--> statement-breakpoint
CREATE INDEX "operator_memory_revision_workspace_run_idx" ON "operator_memory_revision" USING btree ("workspace_id","ai_run_id");--> statement-breakpoint
CREATE INDEX "task_dependency_workspace_task_idx" ON "task_dependency" USING btree ("workspace_id","task_id");
