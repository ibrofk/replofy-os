CREATE TYPE "public"."team_chat_channel_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."team_chat_participant_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."team_chat_participant_type" AS ENUM('team-member', 'ai-agent');--> statement-breakpoint
CREATE TABLE "team_chat_channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"status" "team_chat_channel_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_chat_channel_participant" (
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_chat_channel_participant_workspace_id_channel_id_participant_id_pk" PRIMARY KEY("workspace_id","channel_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "team_chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"participant_type" "team_chat_participant_type" NOT NULL,
	"sender_name" text NOT NULL,
	"content" text NOT NULL,
	"reply_to_message_id" uuid,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_chat_participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"participant_type" "team_chat_participant_type" NOT NULL,
	"linked_user_id" text,
	"description" text DEFAULT '' NOT NULL,
	"status" "team_chat_participant_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_chat_channel" ADD CONSTRAINT "team_chat_channel_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_channel" ADD CONSTRAINT "team_chat_channel_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_channel_participant" ADD CONSTRAINT "team_chat_channel_participant_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_channel_participant" ADD CONSTRAINT "team_chat_channel_participant_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "public"."team_chat_channel"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_channel_participant" ADD CONSTRAINT "team_chat_channel_participant_participant_fk" FOREIGN KEY ("workspace_id","participant_id") REFERENCES "public"."team_chat_participant"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_message" ADD CONSTRAINT "team_chat_message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_message" ADD CONSTRAINT "team_chat_message_channel_fk" FOREIGN KEY ("workspace_id","channel_id") REFERENCES "public"."team_chat_channel"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_message" ADD CONSTRAINT "team_chat_message_participant_fk" FOREIGN KEY ("workspace_id","participant_id") REFERENCES "public"."team_chat_participant"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_message" ADD CONSTRAINT "team_chat_message_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_participant" ADD CONSTRAINT "team_chat_participant_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_participant" ADD CONSTRAINT "team_chat_participant_linked_user_id_user_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_chat_participant" ADD CONSTRAINT "team_chat_participant_creator_membership_fk" FOREIGN KEY ("workspace_id","created_by_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_chat_channel_workspace_id_id_uidx" ON "team_chat_channel" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "team_chat_channel_workspace_updated_idx" ON "team_chat_channel" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_chat_message_workspace_id_id_uidx" ON "team_chat_message" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "team_chat_message_workspace_channel_created_idx" ON "team_chat_message" USING btree ("workspace_id","channel_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_chat_participant_workspace_id_id_uidx" ON "team_chat_participant" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "team_chat_participant_workspace_updated_idx" ON "team_chat_participant" USING btree ("workspace_id","updated_at");