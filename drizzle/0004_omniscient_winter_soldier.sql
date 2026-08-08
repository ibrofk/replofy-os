CREATE TYPE "public"."blog_article_status" AS ENUM('idea', 'planned', 'researching', 'drafting', 'review', 'scheduled', 'published', 'archived', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."blog_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."blog_roadmap_phase" AS ENUM('now', 'next', 'later');--> statement-breakpoint
CREATE TABLE "blog_article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" "blog_article_status" DEFAULT 'idea' NOT NULL,
	"roadmap_phase" "blog_roadmap_phase" DEFAULT 'next' NOT NULL,
	"priority" "blog_priority" DEFAULT 'medium' NOT NULL,
	"owner_user_id" text,
	"target_publish_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"brief" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_source_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"data_points" text[] DEFAULT '{}'::text[] NOT NULL,
	"doc_links" text[] DEFAULT '{}'::text[] NOT NULL,
	"validation_notes" text[] DEFAULT '{}'::text[] NOT NULL,
	"validated_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_article_workspace_slug_uidx" ON "blog_article" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_article_workspace_id_id_uidx" ON "blog_article" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "blog_article_workspace_status_updated_idx" ON "blog_article" USING btree ("workspace_id","status","updated_at");