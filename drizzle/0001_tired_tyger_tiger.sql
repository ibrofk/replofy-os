CREATE TYPE "public"."cycle_goal_status" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in-progress', 'done', 'icebox');--> statement-breakpoint
CREATE TABLE "cycle_goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "cycle_goal_status" DEFAULT 'active' NOT NULL,
	"source_lineage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"title" text NOT NULL,
	"status" "task_status" NOT NULL,
	"effort_points" integer DEFAULT 1 NOT NULL,
	"is_lead_indicator" boolean DEFAULT false NOT NULL,
	"cycle_goal_id" uuid,
	"assignee_user_id" text,
	"completed_at" timestamp with time zone,
	"execution_notes" text DEFAULT '' NOT NULL,
	"source_lineage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_effort_points_check" CHECK ("task"."effort_points" in (1, 2, 3, 5, 8))
);
--> statement-breakpoint
CREATE TABLE "vision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"focus_items" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_lineage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cycle_goal" ADD CONSTRAINT "cycle_goal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_goal" ADD CONSTRAINT "cycle_goal_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_membership_fk" FOREIGN KEY ("workspace_id","assignee_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_cycle_goal_workspace_fk" FOREIGN KEY ("workspace_id","cycle_goal_id") REFERENCES "public"."cycle_goal"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision" ADD CONSTRAINT "vision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vision" ADD CONSTRAINT "vision_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_goal_workspace_id_id_uidx" ON "cycle_goal" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "cycle_goal_workspace_created_idx" ON "cycle_goal" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "task_workspace_created_idx" ON "task" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "task_workspace_status_idx" ON "task" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "task_workspace_cycle_goal_idx" ON "task" USING btree ("workspace_id","cycle_goal_id");--> statement-breakpoint
CREATE INDEX "vision_workspace_created_idx" ON "vision" USING btree ("workspace_id","created_at");