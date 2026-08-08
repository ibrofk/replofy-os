CREATE TYPE "public"."creative_asset_status" AS ENUM('uploading', 'active', 'archived', 'error');
--> statement-breakpoint
CREATE TYPE "public"."creative_asset_type" AS ENUM('image', 'video', 'document', 'source', 'other');
--> statement-breakpoint
CREATE TYPE "public"."creative_format" AS ENUM('single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief', 'static-ad', 'thread', 'other');
--> statement-breakpoint
CREATE TYPE "public"."creative_platform" AS ENUM('Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other');
--> statement-breakpoint
CREATE TYPE "public"."creative_status" AS ENUM('idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'rejected', 'archived');
--> statement-breakpoint
CREATE TABLE "creative_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"creative_id" uuid,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"asset_type" "creative_asset_type" NOT NULL,
	"object_key" text NOT NULL,
	"status" "creative_asset_status" DEFAULT 'uploading' NOT NULL,
	"uploaded_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_asset_file_size_positive" CHECK ("creative_asset"."file_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "creative_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"platform" "creative_platform" DEFAULT 'Instagram' NOT NULL,
	"format" "creative_format" DEFAULT 'single-post' NOT NULL,
	"campaign" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"hook" text DEFAULT '' NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"visual_direction" text DEFAULT '' NOT NULL,
	"production_notes" text DEFAULT '' NOT NULL,
	"cta" text DEFAULT '' NOT NULL,
	"status" "creative_status" DEFAULT 'idea' NOT NULL,
	"owner_user_id" text,
	"approver_user_id" text,
	"target_publish_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"published_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"approval_notes" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_lineage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_workspace_id_id_uidx" ON "creative_asset" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_workspace_object_key_uidx" ON "creative_asset" USING btree ("workspace_id","object_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "creative_item_workspace_id_id_uidx" ON "creative_item" USING btree ("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "creative_asset" ADD CONSTRAINT "creative_asset_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creative_asset" ADD CONSTRAINT "creative_asset_creative_id_creative_item_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creative_item"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creative_asset" ADD CONSTRAINT "creative_asset_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creative_item" ADD CONSTRAINT "creative_item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creative_item" ADD CONSTRAINT "creative_item_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creative_item" ADD CONSTRAINT "creative_item_approver_user_id_user_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creative_item" ADD CONSTRAINT "creative_item_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "creative_asset_workspace_creative_status_idx" ON "creative_asset" USING btree ("workspace_id","creative_id","status");
--> statement-breakpoint
CREATE INDEX "creative_item_workspace_status_updated_idx" ON "creative_item" USING btree ("workspace_id","status","updated_at");
