import json
import os
import sys
import unittest
from pathlib import Path

import httpx
from fastmcp import Client

MCP_DIR = Path(__file__).resolve().parents[1]
if str(MCP_DIR) not in sys.path:
    sys.path.insert(0, str(MCP_DIR))

import replofy_os_mcp_server as server


class ReplofyOsMcpSmokeTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.original_api_key = os.environ.get("REPLOFY_OS_API_KEY")
        self.original_base_url = os.environ.get("REPLOFY_OS_BASE_URL")
        self.original_skills_dir = os.environ.get("REPLOFY_OS_SKILLS_DIR")

    async def asyncTearDown(self) -> None:
        self._restore_env("REPLOFY_OS_API_KEY", self.original_api_key)
        self._restore_env("REPLOFY_OS_BASE_URL", self.original_base_url)
        self._restore_env("REPLOFY_OS_SKILLS_DIR", self.original_skills_dir)

    def _restore_env(self, name: str, value: str | None) -> None:
        if value is None:
            os.environ.pop(name, None)
            return
        os.environ[name] = value

    async def test_server_requires_api_key_to_initialize(self) -> None:
        os.environ.pop("REPLOFY_OS_API_KEY", None)
        os.environ["REPLOFY_OS_BASE_URL"] = "https://example.invalid"

        with self.assertRaisesRegex(RuntimeError, "REPLOFY_OS_API_KEY is required"):
            server._require_env("REPLOFY_OS_API_KEY")

    async def test_server_exposes_expected_metadata_with_dummy_configuration(self) -> None:
        os.environ["REPLOFY_OS_API_KEY"] = "ros_live_test_smoke"
        os.environ["REPLOFY_OS_BASE_URL"] = "https://example.invalid"

        async with Client(server.mcp) as client:
            tools = await client.list_tools()
            resources = await client.list_resources()
            templates = await client.list_resource_templates()
            prompts = await client.list_prompts()
            config_contents = await client.read_resource("replofy://config")
            registry_contents = await client.read_resource("replofy://skills/registry")
            blog_skill_contents = await client.read_resource("replofy://skills/replofy-blog-skill")
            describe_result = await client.call_tool(
                "describe_resource",
                {"resource": "tasks"},
            )

        tool_names = {tool.name for tool in tools}
        resource_uris = {str(resource.uri) for resource in resources}
        template_uris = {str(template.uriTemplate) for template in templates}
        prompt_names = {prompt.name for prompt in prompts}

        self.assertTrue(
            {
                "server_status",
                "list_records",
                "get_record",
                "create_task",
                "list_leads",
                "create_lead",
                "update_lead",
                "list_accounts",
                "create_account",
                "update_account",
                "list_blog_articles",
                "create_blog_article",
                "update_blog_article",
                "download_creative_asset",
                "list_skill_registry",
                "get_skill",
                "list_team_chat_channels",
                "list_team_chat_participants",
                "list_team_chat_messages",
                "register_team_chat_participant",
                "add_team_chat_participant_to_channel",
                "post_team_chat_message",
                "replofy_request",
            }.issubset(tool_names)
        )
        self.assertEqual(
            resource_uris,
            {
                "replofy://config",
                "replofy://context/auto",
                "replofy://context/execution",
                "replofy://context/strategy",
                "replofy://context/content",
                "replofy://blogs/roadmap",
                "replofy://skills/registry",
            },
        )
        self.assertEqual(
            template_uris,
            {
                "replofy://record/{resource}/{record_id}",
                "replofy://resource/{resource}/latest/{limit}",
                "replofy://skills/{skill_name}",
                "replofy://team-chat/channel/{channel_id}/latest/{limit}",
            },
        )
        self.assertEqual(prompt_names, {"workspace_briefing"})

        self.assertEqual(len(config_contents), 1)
        config = json.loads(config_contents[0].text)
        self.assertEqual(config["baseUrl"], "https://example.invalid")
        self.assertIn("tasks", config["resources"])
        self.assertIn("leads", config["resources"])
        self.assertIn("accounts", config["resources"])
        self.assertIn("creative-items", config["resources"])
        self.assertIn("creative-assets", config["resources"])
        self.assertIn("blog-articles", config["resources"])
        self.assertIn("team-chat-channels", config["resources"])
        self.assertIn("team-chat-participants", config["resources"])
        self.assertIn("team-chat-messages", config["resources"])
        self.assertIn("week-markers", config["resources"])
        self.assertIn("get_workspace_context", config["recommendedTools"])
        self.assertIn("get_record", config["recommendedTools"])
        self.assertIn("list_leads", config["recommendedTools"])
        self.assertIn("list_blog_articles", config["recommendedTools"])
        self.assertIn("download_creative_asset", config["recommendedTools"])
        self.assertIn("list_skill_registry", config["recommendedTools"])
        self.assertIn("list_team_chat_messages", config["recommendedTools"])
        self.assertEqual(config["skillRegistry"]["uri"], "replofy://skills/registry")

        self.assertEqual(len(registry_contents), 1)
        registry = json.loads(registry_contents[0].text)
        self.assertGreater(registry["count"], 0)
        self.assertIn("replofy-blog-skill", {skill["name"] for skill in registry["skills"]})

        self.assertEqual(len(blog_skill_contents), 1)
        self.assertIn("# Replofy Blog Skill", blog_skill_contents[0].text)
        self.assertEqual(describe_result.data["resource"], "tasks")
        self.assertIn("filters", describe_result.data["guide"])

    def test_compact_blog_article_normalizes_legacy_status(self) -> None:
        compact = server._compact_blog_article({
            "id": "blog-1",
            "title": "Draft",
            "status": "collecting-docs",
            "evidence": [],
        })

        self.assertEqual(compact["status"], "researching")
        self.assertEqual(compact["roadmapPhase"], "next")

    def test_compact_bug_includes_code_links(self) -> None:
        compact = server._compact_bug({
            "id": "bug-1",
            "title": "Settings crash",
            "severity": "high",
            "status": "open",
            "codeLinks": [
                {
                    "type": "repository",
                    "label": "Helpdesk",
                    "url": "https://github.com/replofy/helpdesk",
                    "notes": "Entry repo",
                },
                {
                    "type": "directory",
                    "url": "src/pages/settings",
                },
            ],
        })

        self.assertEqual(len(compact["codeLinks"]), 2)
        self.assertEqual(compact["codeLinks"][0]["type"], "repository")
        self.assertEqual(compact["codeLinks"][1]["url"], "src/pages/settings")

    def test_describe_resource_accepts_operator_aliases(self) -> None:
        self.assertEqual(server._normalize_resource_name("operator-work-orders"), "operator-work-orders")
        self.assertEqual(server._normalize_resource_name("operator-context-packs"), "operator-context-packs")
        self.assertEqual(server._normalize_resource_name("operator-checkins"), "operator-checkins")
        self.assertEqual(server._normalize_resource_name("operator-outputs"), "operator-outputs")
        self.assertEqual(server._normalize_resource_name("operator-injections"), "operator-injections")
        self.assertEqual(server._normalize_resource_name("business-plans"), "business-plans")
        self.assertEqual(server._normalize_resource_name("weekMarkers"), "week-markers")

    async def test_context_excerpt_fallback_keeps_standalone_writes_usable(self) -> None:
        payload = {"id": "article-1", "title": "Portable by default"}
        enriched = await server._add_context_excerpt(
            None,
            payload,
            scope="content",
            refresh=True,
        )
        self.assertEqual(enriched["id"], "article-1")
        self.assertEqual(enriched["relatedContext"]["attached"], [])
        self.assertFalse(enriched["routing"]["available"])

    async def test_api_request_round_trip_uses_api_key_and_v1_path(self) -> None:
        captured: list[httpx.Request] = []

        async def handler(request: httpx.Request) -> httpx.Response:
            captured.append(request)
            return httpx.Response(
                200,
                json={"data": [{"id": "task-1", "title": "From API"}]},
                request=request,
            )

        client = httpx.AsyncClient(
            base_url="http://mcp-test",
            transport=httpx.MockTransport(handler),
        )
        runtime = server.ReplofyRuntime(
            base_url="http://mcp-test",
            api_key="ros_test_roundtrip",
            timeout_seconds=5,
            client=client,
            context_cache_ttl_seconds=30,
        )

        class ContextStub:
            pass

        context = ContextStub()
        context.lifespan_context = runtime
        try:
            result = await server._request(
                context,
                "GET",
                "/api/v1/tasks",
                query={"limit": 1},
            )
        finally:
            await client.aclose()

        self.assertEqual(result["data"][0]["id"], "task-1")
        self.assertEqual(len(captured), 1)
        self.assertEqual(captured[0].url.path, "/api/v1/tasks")
        self.assertEqual(captured[0].url.params["limit"], "1")
        self.assertEqual(captured[0].headers["x-api-key"], "ros_test_roundtrip")


if __name__ == "__main__":
    unittest.main()
