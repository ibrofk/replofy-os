ALTER TABLE "operator_memory" ADD COLUMN "source_run_id" uuid;--> statement-breakpoint
ALTER TABLE "operator_memory" ADD COLUMN "superseded_memory_id" uuid;--> statement-breakpoint
ALTER TABLE "operator_memory" ADD COLUMN "evidence_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_memory" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_memory" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operator_memory_revision" ADD COLUMN "revision_number" integer DEFAULT 1 NOT NULL;