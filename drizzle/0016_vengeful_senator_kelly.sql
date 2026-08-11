CREATE UNIQUE INDEX IF NOT EXISTS "ai_agent_profile_workspace_id_id_uidx" ON "ai_agent_profile" USING btree ("workspace_id","id");
