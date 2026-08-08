CREATE TYPE "public"."operator_approval_mode" AS ENUM('action_based', 'draft_only', 'propose_injection', 'approve_before_write', 'safe_auto_write');--> statement-breakpoint
CREATE TYPE "public"."operator_check_frequency" AS ENUM('manual', 'daily', 'weekly', 'monthly', 'event');--> statement-breakpoint
CREATE TYPE "public"."operator_claim_policy" AS ENUM('single_agent', 'multi_agent', 'manual_assignment');--> statement-breakpoint
CREATE TYPE "public"."operator_desk_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."operator_desk_type" AS ENUM('ops', 'content', 'creative', 'bug', 'feature', 'research', 'growth', 'feedback');--> statement-breakpoint
CREATE TYPE "public"."operator_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."operator_work_order_status" AS ENUM('draft', 'ready', 'claimed', 'in_progress', 'submitted', 'needs_review', 'approved', 'rejected', 'archived', 'cancelled');--> statement-breakpoint
CREATE TABLE "operator_desk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "operator_desk_type" DEFAULT 'ops' NOT NULL,
	"mission" text NOT NULL,
	"default_check_frequency" "operator_check_frequency" DEFAULT 'manual' NOT NULL,
	"status" "operator_desk_status" DEFAULT 'active' NOT NULL,
	"connected_external_agents" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_output_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"approval_mode" "operator_approval_mode" DEFAULT 'action_based' NOT NULL,
	"routing_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dangerous_action_rules" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_work_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operator_desk_id" uuid NOT NULL,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"status" "operator_work_order_status" DEFAULT 'ready' NOT NULL,
	"priority" "operator_priority" DEFAULT 'medium' NOT NULL,
	"context_pack_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"expected_output_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"approval_mode" "operator_approval_mode" DEFAULT 'action_based' NOT NULL,
	"claim_policy" "operator_claim_policy" DEFAULT 'single_agent' NOT NULL,
	"assigned_external_agent" text,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"available_from" timestamp with time zone,
	"due_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operator_desk" ADD CONSTRAINT "operator_desk_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_desk" ADD CONSTRAINT "operator_desk_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_work_order" ADD CONSTRAINT "operator_work_order_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_work_order" ADD CONSTRAINT "operator_work_order_desk_fk" FOREIGN KEY ("workspace_id","operator_desk_id") REFERENCES "public"."operator_desk"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_work_order" ADD CONSTRAINT "operator_work_order_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operator_desk_workspace_slug_uidx" ON "operator_desk" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_desk_workspace_id_id_uidx" ON "operator_desk" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "operator_desk_workspace_status_idx" ON "operator_desk" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_work_order_workspace_id_id_uidx" ON "operator_work_order" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "operator_work_order_workspace_status_idx" ON "operator_work_order" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "operator_work_order_workspace_desk_idx" ON "operator_work_order" USING btree ("workspace_id","operator_desk_id");