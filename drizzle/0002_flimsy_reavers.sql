CREATE TABLE "standalone_api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standalone_api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "standalone_api_key" ADD CONSTRAINT "standalone_api_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standalone_api_key" ADD CONSTRAINT "standalone_api_key_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standalone_api_key" ADD CONSTRAINT "standalone_api_key_owner_membership_fk" FOREIGN KEY ("workspace_id","owner_user_id") REFERENCES "public"."workspace_membership"("workspace_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "standalone_api_key_workspace_idx" ON "standalone_api_key" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "standalone_api_key_owner_idx" ON "standalone_api_key" USING btree ("owner_user_id");