CREATE TYPE "public"."feedback_sentiment" AS ENUM('positive', 'neutral', 'negative');
--> statement-breakpoint
CREATE TYPE "public"."feedback_source" AS ENUM('Discord', 'Twitter', 'Email');
--> statement-breakpoint
CREATE TYPE "public"."seo_keyword_intent" AS ENUM('high', 'medium', 'low');
--> statement-breakpoint
CREATE TYPE "public"."social_post_platform" AS ENUM('Twitter', 'LinkedIn', 'Loom');
--> statement-breakpoint
CREATE TYPE "public"."social_post_status" AS ENUM('draft', 'scheduled', 'published');
--> statement-breakpoint
CREATE TYPE "public"."time_block_type" AS ENUM('strategic', 'buffer', 'breakout');
--> statement-breakpoint
CREATE TYPE "public"."week_marker_status" AS ENUM('active', 'completed', 'upcoming');
--> statement-breakpoint
CREATE TABLE "chat_read_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" "feedback_source" DEFAULT 'Email' NOT NULL,
	"content" text NOT NULL,
	"sentiment" "feedback_sentiment" DEFAULT 'neutral' NOT NULL,
	"source_lineage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_read_state" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_read_state_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "prompt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"version" text DEFAULT 'v1.0' NOT NULL,
	"content" text NOT NULL,
	"source_lineage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_keyword" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"intent" "seo_keyword_intent" DEFAULT 'high' NOT NULL,
	"cycle_goal_id" uuid,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" "social_post_platform" DEFAULT 'Twitter' NOT NULL,
	"content" text NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "social_post_status" DEFAULT 'scheduled' NOT NULL,
	"source_lineage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" time_block_type DEFAULT 'strategic' NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"day_of_week" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_block_day_of_week_check" CHECK ("time_block"."day_of_week" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "week_marker" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"status" "week_marker_status" DEFAULT 'upcoming' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "week_marker_week_number_check" CHECK ("week_marker"."week_number" between 1 and 12)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_read_state_workspace_channel_user_uidx" ON "chat_read_state" USING btree ("workspace_id","channel_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_workspace_id_id_uidx" ON "feedback" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_workspace_id_id_uidx" ON "prompt" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "seo_keyword_workspace_id_id_uidx" ON "seo_keyword" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_workspace_id_id_uidx" ON "social_post" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "time_block_workspace_id_id_uidx" ON "time_block" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "week_marker_workspace_week_uidx" ON "week_marker" USING btree ("workspace_id","week_number");
--> statement-breakpoint
ALTER TABLE "chat_read_state" ADD CONSTRAINT "chat_read_state_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_read_state" ADD CONSTRAINT "chat_read_state_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "public"."team_chat_channel"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_read_state" ADD CONSTRAINT "chat_read_state_user_membership_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notification_read_state" ADD CONSTRAINT "notification_read_state_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notification_read_state" ADD CONSTRAINT "notification_read_state_user_membership_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prompt" ADD CONSTRAINT "prompt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prompt" ADD CONSTRAINT "prompt_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "seo_keyword" ADD CONSTRAINT "seo_keyword_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "seo_keyword" ADD CONSTRAINT "seo_keyword_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "seo_keyword" ADD CONSTRAINT "seo_keyword_cycle_goal_workspace_fk" FOREIGN KEY ("workspace_id","cycle_goal_id") REFERENCES "public"."cycle_goal"("workspace_id","id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "social_post" ADD CONSTRAINT "social_post_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "week_marker" ADD CONSTRAINT "week_marker_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "week_marker" ADD CONSTRAINT "week_marker_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "feedback_workspace_created_idx" ON "feedback" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE INDEX "feedback_workspace_sentiment_idx" ON "feedback" USING btree ("workspace_id","sentiment");
--> statement-breakpoint
CREATE INDEX "prompt_workspace_created_idx" ON "prompt" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE INDEX "seo_keyword_workspace_created_idx" ON "seo_keyword" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE INDEX "seo_keyword_workspace_intent_idx" ON "seo_keyword" USING btree ("workspace_id","intent");
--> statement-breakpoint
CREATE INDEX "social_post_workspace_scheduled_idx" ON "social_post" USING btree ("workspace_id","scheduled_for");
--> statement-breakpoint
CREATE INDEX "social_post_workspace_status_idx" ON "social_post" USING btree ("workspace_id","status");
--> statement-breakpoint
CREATE INDEX "time_block_workspace_day_start_idx" ON "time_block" USING btree ("workspace_id","day_of_week","start_time");
--> statement-breakpoint
CREATE INDEX "week_marker_workspace_status_idx" ON "week_marker" USING btree ("workspace_id","status");
