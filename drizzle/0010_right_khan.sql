CREATE TYPE "public"."api_endpoint_method" AS ENUM('GET', 'POST', 'PUT', 'DELETE', 'PATCH');--> statement-breakpoint
CREATE TYPE "public"."api_endpoint_status" AS ENUM('draft', 'active', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."environment_deployment_action" AS ENUM('deploy', 'rollback');--> statement-breakpoint
CREATE TYPE "public"."environment_deployment_status" AS ENUM('succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."environment_name" AS ENUM('Local', 'Staging', 'Production');--> statement-breakpoint
CREATE TYPE "public"."environment_status" AS ENUM('healthy', 'deploying', 'failed');--> statement-breakpoint
CREATE TABLE "api_endpoint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"method" "api_endpoint_method" DEFAULT 'GET' NOT NULL,
	"path" text NOT NULL,
	"description" text NOT NULL,
	"status" "api_endpoint_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" "environment_name" NOT NULL,
	"status" "environment_status" DEFAULT 'healthy' NOT NULL,
	"last_sync" timestamp with time zone DEFAULT now() NOT NULL,
	"version" text DEFAULT 'v0.0.0' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environment_deployment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"action" "environment_deployment_action" NOT NULL,
	"status" "environment_deployment_status" DEFAULT 'succeeded' NOT NULL,
	"version" text NOT NULL,
	"previous_version" text,
	"message" text DEFAULT '' NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD CONSTRAINT "api_endpoint_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_endpoint" ADD CONSTRAINT "api_endpoint_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment" ADD CONSTRAINT "environment_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_deployment" ADD CONSTRAINT "environment_deployment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_deployment" ADD CONSTRAINT "environment_deployment_environment_fk" FOREIGN KEY ("workspace_id","environment_id") REFERENCES "public"."environment"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environment_deployment" ADD CONSTRAINT "environment_deployment_requester_membership_fk" FOREIGN KEY ("workspace_id","requested_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_endpoint_workspace_method_path_uidx" ON "api_endpoint" USING btree ("workspace_id","method","path");--> statement-breakpoint
CREATE UNIQUE INDEX "api_endpoint_workspace_id_id_uidx" ON "api_endpoint" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "api_endpoint_workspace_status_updated_idx" ON "api_endpoint" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_workspace_name_uidx" ON "environment" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_workspace_id_id_uidx" ON "environment" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "environment_workspace_status_updated_idx" ON "environment" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "environment_deployment_workspace_id_id_uidx" ON "environment_deployment" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "environment_deployment_workspace_environment_created_idx" ON "environment_deployment" USING btree ("workspace_id","environment_id","created_at");