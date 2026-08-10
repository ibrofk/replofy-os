ALTER TYPE "public"."ai_job_type" ADD VALUE 'index_context' BEFORE 'reindex_workspace';--> statement-breakpoint
ALTER TYPE "public"."ai_job_type" ADD VALUE 'delete_source_projection';--> statement-breakpoint
ALTER TYPE "public"."ai_job_type" ADD VALUE 'learn_patterns';