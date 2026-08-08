CREATE TYPE "public"."approval_action" AS ENUM('create', 'update', 'link', 'comment', 'publish', 'send', 'delete', 'deploy', 'rollback', 'remember');--> statement-breakpoint
CREATE TYPE "public"."approval_risk_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'edited', 'expired', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."approval_write_back_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."operator_checkin_type" AS ENUM('manifest_requested', 'work_order_claimed', 'work_started', 'output_submitted', 'needs_more_context', 'work_skipped', 'work_failed', 'work_completed');--> statement-breakpoint
CREATE TYPE "public"."operator_injection_status" AS ENUM('proposed', 'pending_approval', 'approved', 'completed', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."operator_memory_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."operator_memory_scope" AS ENUM('global', 'operator', 'hub', 'goal', 'artifact', 'work_order', 'checkin');--> statement-breakpoint
CREATE TYPE "public"."operator_memory_state" AS ENUM('suggested', 'active', 'pinned', 'rejected', 'expired', 'archived');--> statement-breakpoint
CREATE TYPE "public"."operator_memory_type" AS ENUM('fact', 'preference', 'decision', 'style', 'constraint', 'lesson', 'avoid', 'source_note', 'workflow_rule');--> statement-breakpoint
CREATE TYPE "public"."operator_output_status" AS ENUM('submitted', 'pending_approval', 'approved', 'rejected', 'injected', 'archived');--> statement-breakpoint
CREATE TABLE "operator_approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operator_desk_id" uuid NOT NULL,
	"work_order_id" uuid,
	"output_id" uuid,
	"injection_id" uuid,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"target_hub" text NOT NULL,
	"action" "approval_action" NOT NULL,
	"risk_level" "approval_risk_level" NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"write_back_status" "approval_write_back_status",
	"write_back_completed_at" timestamp with time zone,
	"target_record_id" text,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"rejection_reason" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_checkin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operator_desk_id" uuid NOT NULL,
	"work_order_id" uuid,
	"external_agent_name" text NOT NULL,
	"external_agent_provider" text,
	"type" "operator_checkin_type" DEFAULT 'manifest_requested' NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_context_pack" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"scope_id" text,
	"source_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_snapshots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"constraints" text[] DEFAULT '{}'::text[] NOT NULL,
	"expected_use" text DEFAULT '' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_injection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"output_id" uuid NOT NULL,
	"target_hub" text NOT NULL,
	"target_record_id" text,
	"action" text NOT NULL,
	"risk_level" "approval_risk_level" DEFAULT 'low' NOT NULL,
	"status" "operator_injection_status" DEFAULT 'proposed' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operator_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scope" "operator_memory_scope" DEFAULT 'operator' NOT NULL,
	"scope_id" text,
	"memory_type" "operator_memory_type" DEFAULT 'lesson' NOT NULL,
	"state" "operator_memory_state" DEFAULT 'active' NOT NULL,
	"content" text NOT NULL,
	"confidence" "operator_memory_confidence" DEFAULT 'medium' NOT NULL,
	"source_checkin_id" uuid,
	"source_output_id" uuid,
	"pinned" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"used_count" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'api' NOT NULL,
	"source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_output" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operator_desk_id" uuid NOT NULL,
	"work_order_id" uuid,
	"external_agent_name" text NOT NULL,
	"output_type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"content" text NOT NULL,
	"structured_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"suggested_destinations" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" "operator_memory_confidence" DEFAULT 'medium' NOT NULL,
	"status" "operator_output_status" DEFAULT 'submitted' NOT NULL,
	"routing_warning" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "operator_approval" ADD CONSTRAINT "operator_approval_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_approval" ADD CONSTRAINT "operator_approval_work_order_id_operator_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."operator_work_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_approval" ADD CONSTRAINT "operator_approval_output_id_operator_output_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."operator_output"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_approval" ADD CONSTRAINT "operator_approval_injection_id_operator_injection_id_fk" FOREIGN KEY ("injection_id") REFERENCES "public"."operator_injection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_approval" ADD CONSTRAINT "operator_approval_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_approval" ADD CONSTRAINT "operator_approval_desk_fk" FOREIGN KEY ("workspace_id","operator_desk_id") REFERENCES "public"."operator_desk"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_approval" ADD CONSTRAINT "operator_approval_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_checkin" ADD CONSTRAINT "operator_checkin_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_checkin" ADD CONSTRAINT "operator_checkin_work_order_id_operator_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."operator_work_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_checkin" ADD CONSTRAINT "operator_checkin_desk_fk" FOREIGN KEY ("workspace_id","operator_desk_id") REFERENCES "public"."operator_desk"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_checkin" ADD CONSTRAINT "operator_checkin_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_context_pack" ADD CONSTRAINT "operator_context_pack_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_context_pack" ADD CONSTRAINT "operator_context_pack_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_injection" ADD CONSTRAINT "operator_injection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_injection" ADD CONSTRAINT "operator_injection_output_fk" FOREIGN KEY ("workspace_id","output_id") REFERENCES "public"."operator_output"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_injection" ADD CONSTRAINT "operator_injection_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_memory" ADD CONSTRAINT "operator_memory_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_memory" ADD CONSTRAINT "operator_memory_source_checkin_id_operator_checkin_id_fk" FOREIGN KEY ("source_checkin_id") REFERENCES "public"."operator_checkin"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_memory" ADD CONSTRAINT "operator_memory_source_output_id_operator_output_id_fk" FOREIGN KEY ("source_output_id") REFERENCES "public"."operator_output"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_memory" ADD CONSTRAINT "operator_memory_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_output" ADD CONSTRAINT "operator_output_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_output" ADD CONSTRAINT "operator_output_work_order_id_operator_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."operator_work_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_output" ADD CONSTRAINT "operator_output_desk_fk" FOREIGN KEY ("workspace_id","operator_desk_id") REFERENCES "public"."operator_desk"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_output" ADD CONSTRAINT "operator_output_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operator_approval_workspace_id_id_uidx" ON "operator_approval" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "operator_approval_workspace_status_idx" ON "operator_approval" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_checkin_workspace_id_id_uidx" ON "operator_checkin" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "operator_checkin_workspace_desk_created_idx" ON "operator_checkin" USING btree ("workspace_id","operator_desk_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_context_pack_workspace_id_id_uidx" ON "operator_context_pack" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "operator_context_pack_workspace_scope_idx" ON "operator_context_pack" USING btree ("workspace_id","scope","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_injection_workspace_id_id_uidx" ON "operator_injection" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "operator_injection_workspace_status_idx" ON "operator_injection" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_memory_workspace_id_id_uidx" ON "operator_memory" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "operator_memory_workspace_scope_state_idx" ON "operator_memory" USING btree ("workspace_id","scope","scope_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_output_workspace_id_id_uidx" ON "operator_output" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "operator_output_workspace_desk_created_idx" ON "operator_output" USING btree ("workspace_id","operator_desk_id","created_at");