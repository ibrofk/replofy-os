from __future__ import annotations

import asyncio
import json
import os
import re
from collections import Counter
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import parse_qsl, quote

import httpx
from fastmcp import Context, FastMCP

ResourceName = Literal[
    "tasks",
    "bugs",
    "roadmap-items",
    "blog-articles",
    "business-plans",
    "visions",
    "cycle-goals",
    "prompts",
    "api-endpoints",
    "environments",
    "social-posts",
    "creative-items",
    "creative-assets",
    "seo-keywords",
    "feedbacks",
    "accounts",
    "leads",
    "time-blocks",
    "week-markers",
    "team-chat-channels",
    "team-chat-participants",
    "team-chat-messages",
    "operator-desks",
    "work-orders",
    "operator-memories",
    "operator-approvals",
    "mcp-registry",
    "weekly-changelog",
    "operator-work-orders",
    "operator-context-packs",
    "operator-checkins",
    "operator-outputs",
    "operator-injections",
    "context-sources",
    "context-source-versions",
    "users",
    "companies",
    "invitations",
]

HttpMethod = Literal["GET", "POST", "PATCH", "DELETE"]
TaskStatus = Literal["todo", "in-progress", "done", "icebox"]
GoalStatus = Literal["active", "completed", "archived"]
PromptVersion = str
WeekWindow = Literal["current", "last"]
ContextScope = Literal["auto", "execution", "strategy", "content"]
EffortPoints = Literal[1, 2, 3, 5, 8]
FeedbackSentiment = Literal["positive", "neutral", "negative"]
FeedbackSource = Literal["Discord", "Twitter", "Email"]
SocialPlatform = Literal["Twitter", "LinkedIn", "Loom"]
SeoIntent = Literal["high", "medium", "low"]
TimeBlockType = Literal["strategic", "buffer", "breakout"]
MemberRole = Literal["admin", "member"]
AccountStatus = Literal["prospect", "customer", "partner", "inactive"]
LeadStage = Literal["new", "qualified", "contacted", "demo-booked", "proposal", "won", "lost"]
LeadSource = Literal["inbound", "referral", "cold-outreach", "waitlist", "twitter", "linkedin", "email", "other"]
LeadPriority = Literal["low", "medium", "high"]

RESOURCES: list[str] = [
    "tasks",
    "bugs",
    "roadmap-items",
    "blog-articles",
    "business-plans",
    "visions",
    "cycle-goals",
    "prompts",
    "api-endpoints",
    "environments",
    "social-posts",
    "creative-items",
    "creative-assets",
    "seo-keywords",
    "feedbacks",
    "accounts",
    "leads",
    "time-blocks",
    "week-markers",
    "team-chat-channels",
    "team-chat-participants",
    "team-chat-messages",
    "operator-desks",
    "work-orders",
    "operator-memories",
    "operator-approvals",
    "mcp-registry",
    "weekly-changelog",
    "operator-work-orders",
    "operator-context-packs",
    "operator-checkins",
    "operator-outputs",
    "operator-injections",
    "context-sources",
    "context-source-versions",
    "users",
    "companies",
    "invitations",
]

RESOURCE_ALIASES: dict[str, ResourceName] = {
    "task": "tasks",
    "tasks": "tasks",
    "bug": "bugs",
    "bugs": "bugs",
    "roadmap": "roadmap-items",
    "roadmap-item": "roadmap-items",
    "roadmap-items": "roadmap-items",
    "roadmapItems": "roadmap-items",
    "technical-roadmap": "roadmap-items",
    "technicalRoadmap": "roadmap-items",
    "blog": "blog-articles",
    "blogs": "blog-articles",
    "blog-article": "blog-articles",
    "blog_article": "blog-articles",
    "blog-articles": "blog-articles",
    "blogArticles": "blog-articles",
    "blogs-hub": "blog-articles",
    "business-plan": "business-plans",
    "business_plan": "business-plans",
    "business-plans": "business-plans",
    "businessPlans": "business-plans",
    "vision": "visions",
    "visions": "visions",
    "cycle-goal": "cycle-goals",
    "cycle_goal": "cycle-goals",
    "cycle-goals": "cycle-goals",
    "cycleGoals": "cycle-goals",
    "prompt": "prompts",
    "prompts": "prompts",
    "api-endpoint": "api-endpoints",
    "api_endpoint": "api-endpoints",
    "api-endpoints": "api-endpoints",
    "apiEndpoints": "api-endpoints",
    "environment": "environments",
    "environments": "environments",
    "social-post": "social-posts",
    "social_post": "social-posts",
    "social-posts": "social-posts",
    "socialPosts": "social-posts",
    "creative-item": "creative-items",
    "creative_item": "creative-items",
    "creative-items": "creative-items",
    "creativeItems": "creative-items",
    "creatives": "creative-items",
    "creative-asset": "creative-assets",
    "creative_asset": "creative-assets",
    "creative-assets": "creative-assets",
    "creativeAssets": "creative-assets",
    "seo-keyword": "seo-keywords",
    "seo_keyword": "seo-keywords",
    "seo-keywords": "seo-keywords",
    "seoKeywords": "seo-keywords",
    "feedback": "feedbacks",
    "feedbacks": "feedbacks",
    "account": "accounts",
    "accounts": "accounts",
    "lead": "leads",
    "leads": "leads",
    "prospect": "leads",
    "prospects": "leads",
    "time-block": "time-blocks",
    "time_block": "time-blocks",
    "time-blocks": "time-blocks",
    "timeBlocks": "time-blocks",
    "week-marker": "week-markers",
    "week_markers": "week-markers",
    "week-markers": "week-markers",
    "weekMarkers": "week-markers",
    "team-chat-channel": "team-chat-channels",
    "team-chat-channels": "team-chat-channels",
    "teamChatChannels": "team-chat-channels",
    "channels": "team-chat-channels",
    "team-chat-participant": "team-chat-participants",
    "team-chat-participants": "team-chat-participants",
    "teamChatParticipants": "team-chat-participants",
    "participants": "team-chat-participants",
    "team-chat-message": "team-chat-messages",
    "team-chat-messages": "team-chat-messages",
    "teamChatMessages": "team-chat-messages",
    "messages": "team-chat-messages",
    "operator-desk": "operator-desks",
    "operator-desks": "operator-desks",
    "work-order": "work-orders",
    "work-orders": "work-orders",
    "operator-work-order": "operator-work-orders",
    "operator-work-orders": "operator-work-orders",
    "operator-context-pack": "operator-context-packs",
    "operator-context-packs": "operator-context-packs",
    "operator-checkin": "operator-checkins",
    "operator-checkins": "operator-checkins",
    "operator-output": "operator-outputs",
    "operator-outputs": "operator-outputs",
    "operator-injection": "operator-injections",
    "operator-injections": "operator-injections",
    "operator-memory": "operator-memories",
    "operator-memories": "operator-memories",
    "operator-approval": "operator-approvals",
    "operator-approvals": "operator-approvals",
    "mcp-registry": "mcp-registry",
    "weekly-changelog": "weekly-changelog",
    "context-source": "context-sources",
    "context_source": "context-sources",
    "context-sources": "context-sources",
    "contextSources": "context-sources",
    "context-source-version": "context-source-versions",
    "context_source_version": "context-source-versions",
    "context-source-versions": "context-source-versions",
    "contextSourceVersions": "context-source-versions",
    "user": "users",
    "users": "users",
    "company": "companies",
    "companies": "companies",
    "invitation": "invitations",
    "invitations": "invitations",
}

RESOURCE_GUIDE: dict[ResourceName, dict[str, Any]] = {
    "tasks": {
        "filters": ["status", "cycleGoalId", "assigneeId", "isLeadIndicator"],
        "createFields": ["title", "status", "effortPoints", "isLeadIndicator", "cycleGoalId", "assigneeId"],
        "notes": [
            "If create_task is called without cycle_goal_id and exactly one active cycle goal exists, the MCP server attaches it automatically.",
            "If no cycle goal is attached, the backend defaults new tasks to icebox unless status is set explicitly.",
        ],
    },
    "bugs": {
        "filters": ["status", "severity"],
        "createFields": ["title", "description", "severity", "status", "resolutionNotes", "linkedTaskIds", "codeLinks"],
        "updateFields": ["title", "description", "severity", "status", "resolutionNotes", "linkedTaskIds", "codeLinks"],
        "notes": [
            "Use list_records with status=open to triage incoming bugs.",
            "Use codeLinks to attach public repository URLs or directory/file paths so agents can jump directly to the relevant code.",
            "Resolution notes, linked task ids, and code links can be updated independently through generic CRUD.",
        ],
    },
    "roadmap-items": {
        "filters": ["phase", "priority", "status"],
        "createFields": ["title", "description", "phase", "priority", "status", "linkedTaskIds"],
        "notes": [
            "Use now/next/later phases to keep feature planning independent from the cycle review flow.",
            "Roadmap items are generic CRUD records and do not require a bespoke MCP tool.",
        ],
    },
    "visions": {
        "createFields": ["title", "description", "focusItems"],
    },
    "cycle-goals": {
        "filters": ["status"],
        "createFields": ["title", "description", "status"],
    },
    "prompts": {
        "createFields": ["title", "version", "content"],
    },
    "api-endpoints": {
        "filters": ["method", "status"],
        "createFields": ["method", "path", "description", "status"],
    },
    "environments": {
        "filters": ["name", "status"],
        "updateFields": ["name", "status", "lastSync", "version"],
    },
    "social-posts": {
        "filters": ["platform", "status"],
        "createFields": ["platform", "content", "scheduledFor", "status"],
    },
    "creative-items": {
        "filters": ["platform", "format", "status", "ownerId", "campaign"],
        "createFields": ["title", "platform", "format", "campaign", "audience", "objective", "hook", "brief", "caption", "visualDirection", "productionNotes", "cta", "status", "ownerId", "targetPublishAt", "scheduledFor", "tags"],
        "updateFields": ["title", "platform", "format", "campaign", "audience", "objective", "hook", "brief", "caption", "visualDirection", "productionNotes", "cta", "status", "ownerId", "approverId", "targetPublishAt", "scheduledFor", "publishedAt", "submittedAt", "approvalNotes", "assetIds", "tags"],
        "notes": [
            "Creative Hub items cover ideas, briefs, drafts, review, scheduling, and manual publication state.",
            "Asset uploads use the platform-specific authenticated binary workflow rather than generic JSON CRUD; downloads use download_creative_asset.",
        ],
    },
    "blog-articles": {
        "filters": ["status", "roadmapPhase", "priority", "ownerId"],
        "createFields": [
            "title",
            "slug",
            "summary",
            "content",
            "status",
            "roadmapPhase",
            "priority",
            "ownerId",
            "targetPublishAt",
            "scheduledFor",
            "brief",
            "evidence",
            "linkedSourceIds",
            "distribution",
            "tags",
        ],
        "updateFields": [
            "title",
            "slug",
            "summary",
            "content",
            "status",
            "roadmapPhase",
            "priority",
            "ownerId",
            "targetPublishAt",
            "scheduledFor",
            "brief",
            "evidence",
            "linkedSourceIds",
            "distribution",
            "tags",
        ],
        "notes": [
            "Blogs Hub articles use idea, planned, researching, drafting, review, scheduled, published, archived, or rejected statuses.",
            "Use roadmapPhase values now, next, or later to maintain the editorial roadmap.",
            "Evidence cards and linkedSourceIds replace the old flat data-point and document-link fields for new work.",
        ],
    },
    "creative-assets": {
        "filters": ["creativeId", "assetType", "status"],
        "notes": [
            "Creative asset metadata is available through generic MCP reads.",
            "Use download_creative_asset with an asset id to create an authenticated download URL.",
        ],
    },
    "seo-keywords": {
        "filters": ["intent", "cycleGoalId"],
        "createFields": ["keyword", "intent", "cycleGoalId"],
        "notes": [
            "create_seo_keyword can auto-attach the single active cycle goal when cycle_goal_id is omitted.",
        ],
    },
    "feedbacks": {
        "filters": ["source", "sentiment"],
        "createFields": ["source", "content", "sentiment"],
    },
    "accounts": {
        "filters": ["status"],
        "createFields": ["name", "website", "industry", "size", "notes", "status", "linkedLeadIds"],
        "updateFields": ["name", "website", "industry", "size", "notes", "status", "linkedLeadIds"],
        "notes": [
            "Accounts belong to the Growth Pipeline and can be linked manually to leads.",
            "Use status values prospect, customer, partner, or inactive.",
        ],
    },
    "leads": {
        "filters": ["stage", "source", "priority", "ownerId", "accountId"],
        "createFields": [
            "name",
            "email",
            "companyName",
            "accountId",
            "source",
            "stage",
            "priority",
            "ownerId",
            "nextAction",
            "nextActionAt",
            "notes",
            "linkedTaskIds",
        ],
        "updateFields": [
            "name",
            "email",
            "companyName",
            "accountId",
            "source",
            "stage",
            "priority",
            "ownerId",
            "nextAction",
            "nextActionAt",
            "notes",
            "linkedTaskIds",
        ],
        "notes": [
            "Leads belong to the Growth Pipeline and use manual task links only in v1.",
            "Use stage values new, qualified, contacted, demo-booked, proposal, won, or lost.",
        ],
    },
    "time-blocks": {
        "filters": ["type", "dayOfWeek"],
        "createFields": ["title", "type", "startTime", "endTime", "dayOfWeek"],
    },
    "week-markers": {
        "filters": ["status", "weekNumber"],
        "createFields": ["weekNumber", "status", "startedAt", "endedAt"],
        "notes": [
            "Only weeks 1 through 12 are valid and a workspace can have one marker per week.",
            "Starting an active marker completes any other active marker in the same workspace.",
        ],
    },
    "team-chat-channels": {
        "filters": ["status"],
        "createFields": ["name", "topic", "status", "participantIds"],
        "updateFields": ["name", "topic", "status", "participantIds"],
        "notes": [
            "Use add_team_chat_participant_to_channel for atomic channel membership updates.",
        ],
    },
    "team-chat-participants": {
        "filters": ["participantType", "status", "linkedUserId"],
        "createFields": ["displayName", "participantType", "linkedUserId", "description", "status"],
        "updateFields": ["displayName", "linkedUserId", "description", "status"],
        "notes": [
            "Register AI agents with a custom displayName before adding them to a channel.",
        ],
    },
    "team-chat-messages": {
        "filters": ["channelId", "participantId", "participantType", "senderName", "after", "before", "query"],
        "createFields": ["channelId", "participantId", "content", "replyToMessageId"],
        "notes": [
            "Use list_team_chat_messages for bounded history reads with ISO-8601 after/before filters and pagination.",
            "Messages are immutable and preserve sender name/type snapshots.",
        ],
    },
    "operator-desks": {
        "filters": ["status", "type"],
        "createFields": ["name", "slug", "type", "status", "description", "mission", "instructions", "approvalMode"],
        "notes": [
            "Operator desks are the source-of-truth workspace units used by the desk operations flow.",
            "Use generic CRUD for browse, create, update, and archive workflows.",
        ],
    },
    "business-plans": {
        "filters": ["status"],
        "createFields": ["title", "summary", "content", "status", "tags", "links"],
    },
    "operator-work-orders": {
        "filters": ["status", "deskId", "assignedToId"],
        "notes": [
            "Alias for work-orders in the workspace describe_resource surface.",
            "Use work-orders for CRUD and listing operations.",
        ],
    },
    "operator-context-packs": {
        "notes": [
            "Workspace alias for operator context pack bundles.",
            "Use the live workspace context and related resource routes for the underlying records.",
        ],
    },
    "operator-checkins": {
        "notes": [
            "Workspace alias for operator check-ins.",
            "Use the operator workflow or workspace context routes for current records.",
        ],
    },
    "operator-outputs": {
        "notes": [
            "Workspace alias for operator output records.",
            "Use the operator workflow or workspace context routes for current records.",
        ],
    },
    "operator-injections": {
        "notes": [
            "Workspace alias for operator injection records.",
            "Use the operator workflow or workspace context routes for current records.",
        ],
    },
    "work-orders": {
        "filters": ["status", "deskId", "assignedToId"],
        "createFields": ["title", "status", "deskId", "payload", "priority"],
        "notes": [
            "Work orders represent runnable desk items and should be read through the generic resource routes.",
        ],
    },
    "operator-memories": {
        "filters": ["scope", "type", "confidence"],
        "createFields": ["title", "content", "scope", "type", "confidence", "status"],
    },
    "operator-approvals": {
        "filters": ["status", "resourceType"],
        "createFields": ["title", "status", "resourceType", "resourceId", "requestedBy"],
    },
    "mcp-registry": {
        "filters": ["status", "category"],
        "createFields": ["name", "status", "category", "description", "uri"],
    },
    "weekly-changelog": {
        "notes": ["Use the reports route for read-only weekly changelog snapshots."],
    },
    "context-sources": {
        "filters": ["status", "sourceKey"],
    },
    "context-source-versions": {
        "filters": ["sourceId", "sourceKey", "status"],
    },
    "users": {
        "filters": ["role", "companyId"],
    },
    "companies": {
        "updateFields": ["name"],
    },
    "invitations": {
        "filters": ["email", "role"],
        "createFields": ["email", "role"],
        "notes": [
            "Invitations require a company-scoped API key with admin access.",
        ],
    },
}

CONTEXT_SCOPE_LIMITS: dict[ContextScope, dict[str, int]] = {
    "auto": {
        "tasks": 50,
        "bugs": 10,
        "roadmap-items": 10,
        "blog-articles": 8,
        "visions": 5,
        "prompts": 5,
        "feedbacks": 5,
        "accounts": 20,
        "leads": 40,
        "social-posts": 5,
        "creative-items": 8,
        "seo-keywords": 8,
        "cycle-goals": 10,
    },
    "execution": {
        "tasks": 80,
        "bugs": 20,
        "roadmap-items": 10,
        "blog-articles": 5,
        "visions": 3,
        "prompts": 3,
        "feedbacks": 3,
        "accounts": 20,
        "leads": 50,
        "social-posts": 3,
        "creative-items": 6,
        "seo-keywords": 5,
        "cycle-goals": 12,
    },
    "strategy": {
        "tasks": 40,
        "bugs": 8,
        "roadmap-items": 20,
        "blog-articles": 12,
        "visions": 8,
        "prompts": 6,
        "feedbacks": 8,
        "accounts": 30,
        "leads": 30,
        "social-posts": 4,
        "creative-items": 8,
        "seo-keywords": 12,
        "cycle-goals": 12,
    },
    "content": {
        "tasks": 25,
        "bugs": 3,
        "roadmap-items": 3,
        "blog-articles": 30,
        "visions": 5,
        "prompts": 10,
        "feedbacks": 5,
        "accounts": 10,
        "leads": 15,
        "social-posts": 10,
        "creative-items": 25,
        "seo-keywords": 15,
        "cycle-goals": 8,
    },
}

TASK_STATUS_PRIORITY = {
    "in-progress": 0,
    "todo": 1,
    "icebox": 2,
    "done": 3,
}

DEFAULT_SKILLS_DIR = Path(__file__).resolve().parents[2] / ".agents" / "skills"
SKILL_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")


@dataclass
class CacheEntry:
    fetched_at: datetime
    payload: dict[str, Any]


@dataclass
class ReplofyRuntime:
    base_url: str
    api_key: str
    timeout_seconds: float
    client: httpx.AsyncClient
    context_cache_ttl_seconds: float
    context_cache: dict[str, CacheEntry] = field(default_factory=dict)


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required for the Replofy MCP server.")
    return value


def _normalize_query(params: dict[str, Any] | None) -> list[tuple[str, str]] | None:
    if not params:
        return None

    encoded: list[tuple[str, str]] = []
    for key, value in params.items():
        if value is None:
            continue

        if isinstance(value, list):
            for item in value:
                encoded.append((key, _stringify_value(item)))
            continue

        encoded.append((key, _stringify_value(value)))

    return encoded or None


def _stringify_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return str(value)


def _runtime(context: Context) -> ReplofyRuntime:
    fastmcp_context = getattr(context, "fastmcp_context", None)
    if fastmcp_context is not None and hasattr(fastmcp_context, "lifespan_context"):
        return fastmcp_context.lifespan_context
    request_context = getattr(context, "request_context", None)
    if request_context is not None and hasattr(request_context, "lifespan_context"):
        return request_context.lifespan_context
    return context.lifespan_context


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat().replace("+00:00", "Z")


def _first(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    return items[0] if items else None


def _ensure_limit(limit: int, *, default: int, maximum: int = 500) -> int:
    if limit <= 0:
        return default
    return min(limit, maximum)


def _truncate(value: str | None, limit: int = 160) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3].rstrip()}..."


def _coerce_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _coerce_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _infer_code_link_type(url: str) -> str:
    normalized = url.lower()
    if any(host in normalized for host in ("github.com/", "gitlab.com/", "bitbucket.org/")) or normalized.endswith(".git"):
        return "repository"
    return "directory"


def _coerce_code_links(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    links: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in value:
        candidate: dict[str, Any]
        if isinstance(item, str):
            candidate = {"url": item}
        elif isinstance(item, dict):
            candidate = item
        else:
            continue

        url = _coerce_text(candidate.get("url"))
        if not url:
            continue

        link_type = candidate.get("type") if candidate.get("type") in {"repository", "directory"} else _infer_code_link_type(url)
        dedupe_key = (str(link_type), url.lower())
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        link = {"type": str(link_type), "url": url}
        label = _coerce_text(candidate.get("label"))
        notes = _truncate(_coerce_text(candidate.get("notes")), 120)
        if label:
            link["label"] = label
        if notes:
            link["notes"] = notes
        links.append(link)
        if len(links) >= 25:
            break

    return links


def _coerce_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _normalize_blog_status(value: Any) -> str:
    status = str(value or "idea")
    legacy_mapping = {
        "brainstorming": "idea",
        "collecting-data": "researching",
        "collecting-docs": "researching",
        "validating": "review",
        "progressing": "drafting",
        "finished": "published",
    }
    return legacy_mapping.get(status, status)


def _skills_dir() -> Path:
    configured = os.getenv("REPLOFY_OS_SKILLS_DIR", "").strip()
    return Path(configured).expanduser().resolve() if configured else DEFAULT_SKILLS_DIR.resolve()


def _parse_skill_frontmatter(markdown: str) -> dict[str, Any]:
    markdown = markdown.replace("\r\n", "\n")
    if not markdown.startswith("---\n"):
        return {}

    closing_index = markdown.find("\n---", 4)
    if closing_index == -1:
        return {}

    lines = markdown[4:closing_index].splitlines()
    metadata: dict[str, Any] = {}
    index = 0
    while index < len(lines):
        line = lines[index]
        if ":" not in line:
            index += 1
            continue

        key, raw_value = line.split(":", 1)
        key = key.strip()
        raw_value = raw_value.strip()
        if raw_value == "|":
            block: list[str] = []
            index += 1
            while index < len(lines) and (not lines[index].strip() or lines[index].startswith((" ", "\t"))):
                block.append(lines[index].strip())
                index += 1
            metadata[key] = " ".join(part for part in block if part).strip()
            continue

        if raw_value.lower() in {"true", "false"}:
            metadata[key] = raw_value.lower() == "true"
        else:
            metadata[key] = raw_value
        index += 1

    return metadata


def _skill_registry() -> dict[str, Any]:
    skills_dir = _skills_dir()
    skills: list[dict[str, Any]] = []
    if skills_dir.is_dir():
        for skill_file in sorted(skills_dir.glob("*/SKILL.md")):
            resolved_file = skill_file.resolve()
            if resolved_file.parent.parent != skills_dir:
                continue

            markdown = resolved_file.read_text(encoding="utf-8")
            metadata = _parse_skill_frontmatter(markdown)
            name = str(metadata.get("name") or resolved_file.parent.name).strip()
            if not SKILL_NAME_PATTERN.fullmatch(name):
                continue

            skills.append({
                "name": name,
                "description": str(metadata.get("description") or "").strip(),
                "userInvocable": bool(metadata.get("user-invocable", False)),
                "uri": f"replofy://skills/{name}",
            })

    return {
        "directory": str(skills_dir),
        "count": len(skills),
        "skills": skills,
    }


def _read_skill(skill_name: str) -> dict[str, Any]:
    normalized_name = skill_name.strip()
    if not SKILL_NAME_PATTERN.fullmatch(normalized_name):
        raise RuntimeError("Skill names must use lowercase kebab-case.")

    skills_dir = _skills_dir()
    skill_file = (skills_dir / normalized_name / "SKILL.md").resolve()
    if skill_file.parent.parent != skills_dir or not skill_file.is_file():
        raise RuntimeError(f"Skill '{normalized_name}' was not found in the Replofy OS skill registry.")

    markdown = skill_file.read_text(encoding="utf-8")
    metadata = _parse_skill_frontmatter(markdown)
    return {
        "name": normalized_name,
        "description": str(metadata.get("description") or "").strip(),
        "userInvocable": bool(metadata.get("user-invocable", False)),
        "uri": f"replofy://skills/{normalized_name}",
        "markdown": markdown,
    }


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None

    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _extract_records(payload: dict[str, Any]) -> list[dict[str, Any]]:
    records = payload.get("data")
    if isinstance(records, list):
        return [item for item in records if isinstance(item, dict)]
    return []


def _compact_company(record: dict[str, Any] | None) -> dict[str, Any] | None:
    if not record:
        return None
    return {
        "id": record.get("id"),
        "name": record.get("name"),
        "ownerId": record.get("ownerId"),
    }


def _compact_user(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "name": record.get("name"),
        "email": record.get("email"),
        "role": record.get("role"),
    }


def _compact_cycle_goal(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "title": record.get("title"),
        "status": record.get("status"),
        "description": _truncate(_coerce_text(record.get("description")), 180),
    }


def _compact_task(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "title": record.get("title"),
        "status": record.get("status"),
        "effortPoints": record.get("effortPoints"),
        "cycleGoalId": record.get("cycleGoalId"),
        "assigneeId": record.get("assigneeId"),
        "isLeadIndicator": record.get("isLeadIndicator"),
    }


def _compact_bug(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "title": record.get("title"),
        "severity": record.get("severity"),
        "status": record.get("status"),
        "resolutionNotes": _truncate(_coerce_text(record.get("resolutionNotes")), 180),
        "linkedTaskIds": _coerce_list(record.get("linkedTaskIds"))[:8],
        "codeLinks": _coerce_code_links(record.get("codeLinks"))[:8],
    }


def _compact_roadmap_item(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "title": record.get("title"),
        "phase": record.get("phase"),
        "priority": record.get("priority"),
        "status": record.get("status"),
        "description": _truncate(_coerce_text(record.get("description")), 180),
        "linkedTaskIds": _coerce_list(record.get("linkedTaskIds"))[:8],
    }


def _compact_blog_article(record: dict[str, Any]) -> dict[str, Any]:
    brief = _coerce_dict(record.get("brief"))
    evidence = record.get("evidence") if isinstance(record.get("evidence"), list) else []
    verified_evidence = [
        item for item in evidence
        if isinstance(item, dict) and item.get("confidence") == "verified"
    ]
    return {
        "id": record.get("id"),
        "title": record.get("title"),
        "slug": record.get("slug"),
        "status": _normalize_blog_status(record.get("status")),
        "roadmapPhase": record.get("roadmapPhase") or "next",
        "priority": record.get("priority") or "medium",
        "ownerId": record.get("ownerId"),
        "targetPublishAt": record.get("targetPublishAt"),
        "scheduledFor": record.get("scheduledFor"),
        "publishedAt": record.get("publishedAt"),
        "summary": _truncate(_coerce_text(record.get("summary")), 180),
        "audience": _truncate(_coerce_text(brief.get("audience")), 120),
        "painPoint": _truncate(_coerce_text(brief.get("painPoint")), 180),
        "thesis": _truncate(_coerce_text(brief.get("thesis")), 220),
        "contentCluster": brief.get("contentCluster"),
        "primaryKeyword": _coerce_dict(record.get("distribution")).get("primaryKeyword"),
        "evidenceCount": len(evidence),
        "verifiedEvidenceCount": len(verified_evidence),
        "linkedSourceIds": _coerce_list(record.get("linkedSourceIds"))[:12],
        "tags": _coerce_list(record.get("tags"))[:8],
    }


def _compact_vision(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "title": record.get("title"),
        "description": _truncate(_coerce_text(record.get("description")), 220),
        "focusItems": _coerce_list(record.get("focusItems"))[:5],
    }


def _compact_prompt(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "title": record.get("title"),
        "version": record.get("version"),
        "contentPreview": _truncate(_coerce_text(record.get("content")), 160),
    }


def _compact_environment(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "name": record.get("name"),
        "status": record.get("status"),
        "version": record.get("version"),
        "lastSync": record.get("lastSync"),
    }


def _compact_feedback(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "source": record.get("source"),
        "sentiment": record.get("sentiment"),
        "content": _truncate(_coerce_text(record.get("content")), 160),
    }


def _compact_account(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "name": record.get("name"),
        "website": record.get("website"),
        "industry": record.get("industry"),
        "size": record.get("size"),
        "status": record.get("status"),
        "notes": _truncate(_coerce_text(record.get("notes")), 180),
        "linkedLeadIds": _coerce_list(record.get("linkedLeadIds"))[:10],
    }


def _compact_lead(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "name": record.get("name"),
        "email": record.get("email"),
        "companyName": record.get("companyName"),
        "accountId": record.get("accountId"),
        "source": record.get("source"),
        "stage": record.get("stage"),
        "priority": record.get("priority"),
        "ownerId": record.get("ownerId"),
        "nextAction": record.get("nextAction"),
        "nextActionAt": record.get("nextActionAt"),
        "notes": _truncate(_coerce_text(record.get("notes")), 180),
        "linkedTaskIds": _coerce_list(record.get("linkedTaskIds"))[:10],
    }


def _compact_social_post(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "platform": record.get("platform"),
        "status": record.get("status"),
        "scheduledFor": record.get("scheduledFor"),
        "content": _truncate(_coerce_text(record.get("content")), 140),
    }


def _compact_creative_item(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "title": record.get("title"),
        "platform": record.get("platform"),
        "format": record.get("format"),
        "campaign": record.get("campaign"),
        "status": record.get("status"),
        "ownerId": record.get("ownerId"),
        "targetPublishAt": record.get("targetPublishAt"),
        "scheduledFor": record.get("scheduledFor"),
        "hook": _truncate(_coerce_text(record.get("hook")), 160),
        "brief": _truncate(_coerce_text(record.get("brief")), 220),
        "tags": _coerce_list(record.get("tags"))[:8],
    }


def _compact_creative_asset(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "creativeId": record.get("creativeId"),
        "title": record.get("title"),
        "fileName": record.get("fileName"),
        "mimeType": record.get("mimeType"),
        "fileSize": record.get("fileSize"),
        "assetType": record.get("assetType"),
        "status": record.get("status"),
        "uploadedAt": record.get("uploadedAt"),
    }


def _compact_seo_keyword(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "keyword": record.get("keyword"),
        "intent": record.get("intent"),
        "cycleGoalId": record.get("cycleGoalId"),
    }


def _compact_api_endpoint(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "method": record.get("method"),
        "path": record.get("path"),
        "status": record.get("status"),
        "description": _truncate(_coerce_text(record.get("description")), 160),
    }


def _compact_time_block(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "title": record.get("title"),
        "type": record.get("type"),
        "dayOfWeek": record.get("dayOfWeek"),
        "startTime": record.get("startTime"),
        "endTime": record.get("endTime"),
    }


def _compact_invitation(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "email": record.get("email"),
        "role": record.get("role"),
        "companyId": record.get("companyId"),
    }


def _compact_team_chat_channel(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "name": record.get("name"),
        "topic": _truncate(_coerce_text(record.get("topic")), 160),
        "status": record.get("status"),
        "participantIds": _coerce_list(record.get("participantIds"))[:20],
        "updatedAt": record.get("updatedAt"),
    }


def _compact_team_chat_participant(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "displayName": record.get("displayName"),
        "participantType": record.get("participantType"),
        "linkedUserId": record.get("linkedUserId"),
        "description": _truncate(_coerce_text(record.get("description")), 160),
        "status": record.get("status"),
    }


def _compact_team_chat_message(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "channelId": record.get("channelId"),
        "participantId": record.get("participantId"),
        "participantType": record.get("participantType"),
        "senderName": record.get("senderName"),
        "content": _truncate(_coerce_text(record.get("content")), 240),
        "replyToMessageId": record.get("replyToMessageId"),
        "createdAt": record.get("createdAt"),
    }


def _compact_record(resource: ResourceName, record: dict[str, Any]) -> dict[str, Any]:
    if resource == "tasks":
        return _compact_task(record)
    if resource == "bugs":
        return _compact_bug(record)
    if resource == "roadmap-items":
        return _compact_roadmap_item(record)
    if resource == "blog-articles":
        return _compact_blog_article(record)
    if resource == "visions":
        return _compact_vision(record)
    if resource == "cycle-goals":
        return _compact_cycle_goal(record)
    if resource == "prompts":
        return _compact_prompt(record)
    if resource == "api-endpoints":
        return _compact_api_endpoint(record)
    if resource == "environments":
        return _compact_environment(record)
    if resource == "social-posts":
        return _compact_social_post(record)
    if resource == "creative-items":
        return _compact_creative_item(record)
    if resource == "creative-assets":
        return _compact_creative_asset(record)
    if resource == "seo-keywords":
        return _compact_seo_keyword(record)
    if resource == "feedbacks":
        return _compact_feedback(record)
    if resource == "accounts":
        return _compact_account(record)
    if resource == "leads":
        return _compact_lead(record)
    if resource == "time-blocks":
        return _compact_time_block(record)
    if resource == "week-markers":
        return {
            "id": record.get("id"),
            "weekNumber": record.get("weekNumber"),
            "status": record.get("status"),
            "startedAt": record.get("startedAt"),
            "endedAt": record.get("endedAt"),
        }
    if resource == "team-chat-channels":
        return _compact_team_chat_channel(record)
    if resource == "team-chat-participants":
        return _compact_team_chat_participant(record)
    if resource == "team-chat-messages":
        return _compact_team_chat_message(record)
    if resource == "users":
        return _compact_user(record)
    if resource == "companies":
        return _compact_company(record) or {}
    if resource == "invitations":
        return _compact_invitation(record)
    return {"id": record.get("id"), "title": record.get("title")}


def _sort_tasks_for_execution(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        tasks,
        key=lambda item: (
            TASK_STATUS_PRIORITY.get(str(item.get("status")), 99),
            str(item.get("createdAt") or ""),
        ),
    )


def _build_context_cache_key(scope: ContextScope, open_task_limit: int) -> str:
    return json.dumps({"scope": scope, "openTaskLimit": open_task_limit}, sort_keys=True)


def _normalize_scope(scope: str) -> ContextScope:
    if scope not in CONTEXT_SCOPE_LIMITS:
        raise RuntimeError(f"Unsupported context scope '{scope}'. Use one of: {', '.join(CONTEXT_SCOPE_LIMITS.keys())}.")
    return scope  # type: ignore[return-value]


def _normalize_resource_name(resource: str) -> ResourceName:
    key = resource.strip()
    if key in RESOURCE_ALIASES:
        return RESOURCE_ALIASES[key]

    normalized = key.replace("_", "-")
    if normalized in RESOURCE_ALIASES:
        return RESOURCE_ALIASES[normalized]

    raise RuntimeError(
        f"Unsupported resource '{resource}'. Use one of: {', '.join(RESOURCES)}."
    )


def _normalize_filters(filters: dict[str, Any] | str | None) -> dict[str, Any] | None:
    if filters is None:
        return None
    if isinstance(filters, dict):
        return filters or None
    if not isinstance(filters, str):
        raise RuntimeError("filters must be either a dictionary or a query-string like 'status=todo&assigneeId=123'.")

    parsed: dict[str, Any] = {}
    for key, value in parse_qsl(filters, keep_blank_values=False):
        if key in parsed:
            existing = parsed[key]
            if isinstance(existing, list):
                existing.append(value)
            else:
                parsed[key] = [existing, value]
        else:
            parsed[key] = value
    return parsed or None


def _patch_diff(current: dict[str, Any], patch: dict[str, Any]) -> dict[str, dict[str, Any]]:
    differences: dict[str, dict[str, Any]] = {}
    for key, requested in patch.items():
        existing = current.get(key)
        if existing != requested:
            differences[key] = {
                "current": existing,
                "requested": requested,
            }
    return differences


def _put_if_present(payload: dict[str, Any], key: str, value: Any) -> None:
    if value is not None:
        payload[key] = value


async def _request(
    context: Context,
    method: HttpMethod,
    path: str,
    *,
    query: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    runtime = _runtime(context)
    normalized_path = path if path.startswith("/") else f"/{path}"

    response = await runtime.client.request(
        method=method,
        url=normalized_path,
        params=_normalize_query(query),
        json=body,
        headers={"x-api-key": runtime.api_key},
    )

    try:
        payload = response.json()
    except ValueError:
        payload = {"raw": response.text}

    if response.is_error:
        error_message = payload.get("error") if isinstance(payload, dict) else response.text
        raise RuntimeError(f"{response.status_code} {error_message}")

    if isinstance(payload, dict):
        return payload

    return {"data": payload}


async def _list_resource(
    context: Context,
    resource: ResourceName,
    *,
    limit: int = 50,
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    payload = await _request(
        context,
        "GET",
        f"/api/v1/{resource}",
        query={**(filters or {}), "limit": _ensure_limit(limit, default=50)},
    )
    return _extract_records(payload)


async def _get_record_with_fallback(
    context: Context,
    resource: ResourceName,
    record_id: str,
    *,
    debug: bool = False,
) -> dict[str, Any]:
    query = {"debug": "true"} if debug else None
    try:
        return await _request(
            context,
            "GET",
            f"/api/v1/context-routing/{resource}/{record_id}",
            query=query,
        )
    except RuntimeError as error:
        if not str(error).startswith("404"):
            raise

    direct = await _request(
        context,
        "GET",
        f"/api/v1/{resource}/{record_id}",
    )
    data = direct.get("data") if isinstance(direct.get("data"), dict) else direct
    return {
        "data": data,
        "relatedContext": {
            "attached": [],
            "suggestions": [],
            "hasMore": False,
        },
        "routing": {
            "strategy": "direct-resource-fallback",
            "available": False,
        },
        "fallback": "direct-resource",
    }


async def _resolve_cycle_goal_assignment(
    context: Context,
    *,
    cycle_goal_id: str | None,
    auto_attach_active: bool,
) -> tuple[str | None, list[str], dict[str, Any] | None]:
    notes: list[str] = []

    if cycle_goal_id:
        goal_payload = await _get_record_with_fallback(context, "cycle-goals", cycle_goal_id)
        goal = goal_payload.get("data") if isinstance(goal_payload.get("data"), dict) else None
        return cycle_goal_id, notes, _compact_cycle_goal(goal) if goal else None

    if not auto_attach_active:
        return None, notes, None

    active_goals = await _list_resource(context, "cycle-goals", limit=50, filters={"status": "active"})
    if len(active_goals) == 1:
        selected = active_goals[0]
        notes.append(f"Attached to active cycle goal '{selected.get('title')}'.")
        return str(selected.get("id")), notes, _compact_cycle_goal(selected)

    if len(active_goals) == 0:
        notes.append("No active cycle goal was found, so this record was created without a cycle goal link.")
        return None, notes, None

    notes.append("Multiple active cycle goals exist. Provide cycle_goal_id explicitly to avoid ambiguity.")
    return None, notes, None


def _context_notes(
    *,
    company: dict[str, Any] | None,
    active_cycle_goals: list[dict[str, Any]],
    open_tasks: list[dict[str, Any]],
    bugs: list[dict[str, Any]],
    roadmap_items: list[dict[str, Any]],
    blog_articles: list[dict[str, Any]],
    visions: list[dict[str, Any]],
    leads: list[dict[str, Any]],
    environments: list[dict[str, Any]],
) -> list[str]:
    notes: list[str] = []

    if company and company.get("name"):
        notes.append(f"Workspace company: {company['name']}.")
    if not active_cycle_goals:
        notes.append("There is no active cycle goal right now.")
    elif len(active_cycle_goals) == 1:
        notes.append(f"Single active cycle goal: {active_cycle_goals[0].get('title')}.")
    else:
        notes.append(f"There are {len(active_cycle_goals)} active cycle goals, so task auto-linking may be ambiguous.")

    if not visions:
        notes.append("No vision documents are currently stored.")
    if not open_tasks:
        notes.append("No open tasks were found in todo or in-progress.")

    open_leads = [item for item in leads if item.get("stage") not in {"won", "lost"}]
    due_leads = [
        item
        for item in open_leads
        if (next_action_at := _parse_iso_datetime(item.get("nextActionAt"))) and next_action_at <= _utc_now()
    ]
    if not open_leads:
        notes.append("No open Growth Pipeline leads are currently stored.")
    elif due_leads:
        notes.append(f"{len(due_leads)} Growth Pipeline follow-up(s) are due.")

    open_bugs = [item for item in bugs if item.get("status") not in {"resolved", "closed"}]
    if not open_bugs:
        notes.append("No open bugs are currently stored.")
    else:
        critical_bugs = [item for item in open_bugs if item.get("severity") == "critical"]
        if critical_bugs:
            notes.append(f"{len(critical_bugs)} critical bugs need attention.")

    blocked_roadmap_items = [item for item in roadmap_items if item.get("status") == "blocked"]
    if not roadmap_items:
        notes.append("No roadmap items are currently stored.")
    elif blocked_roadmap_items:
        notes.append(f"{len(blocked_roadmap_items)} roadmap items are blocked.")

    active_blog_articles = [
        item
        for item in blog_articles
        if item.get("status") not in {"published", "archived", "rejected"}
    ]
    articles_without_evidence = [item for item in active_blog_articles if not item.get("evidenceCount")]
    if articles_without_evidence:
        notes.append(f"{len(articles_without_evidence)} active Blogs Hub article(s) have no evidence cards.")

    failed_envs = [item for item in environments if item.get("status") == "failed"]
    if failed_envs:
        notes.append(f"{len(failed_envs)} environment entries are currently marked as failed.")

    return notes


def _render_context_markdown(snapshot: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# Replofy Workspace Context ({snapshot['scope']})")
    lines.append("")
    lines.append(f"Generated at: {snapshot['generatedAt']}")

    company = snapshot.get("company")
    if company:
        lines.append("")
        lines.append("## Company")
        lines.append(f"- {company.get('name', 'Unnamed company')} ({company.get('id')})")

    team = snapshot.get("team", [])
    if team:
        lines.append("")
        lines.append("## Team")
        for member in team:
            label = member.get("name") or member.get("email") or member.get("id")
            role = member.get("role") or "member"
            lines.append(f"- {label} [{role}]")

    visions = snapshot.get("visions", [])
    if visions:
        lines.append("")
        lines.append("## Visions")
        for vision in visions:
            detail = vision.get("description") or "No description."
            lines.append(f"- {vision.get('title')}: {detail}")

    cycle_goals = snapshot.get("activeCycleGoals", [])
    if cycle_goals:
        lines.append("")
        lines.append("## Active Cycle Goals")
        for goal in cycle_goals:
            detail = goal.get("description") or "No description."
            lines.append(f"- {goal.get('title')}: {detail}")

    lines.append("")
    lines.append("## Task Summary")
    task_counts = snapshot.get("taskCounts", {})
    lines.append(
        f"- todo: {task_counts.get('todo', 0)} | in-progress: {task_counts.get('in-progress', 0)} | icebox: {task_counts.get('icebox', 0)} | done: {task_counts.get('done', 0)}"
    )

    open_tasks = snapshot.get("openTasks", [])
    if open_tasks:
        lines.append("- Open tasks:")
        for task in open_tasks:
            suffix = f" [{task.get('status')}]"
            if task.get("effortPoints") is not None:
                suffix += f" ({task.get('effortPoints')} pts)"
            lines.append(f"  - {task.get('title')}{suffix}")

    bugs = snapshot.get("bugs", [])
    if bugs:
        lines.append("")
        lines.append("## Bugs")
        for bug in bugs:
            notes = bug.get("resolutionNotes") or bug.get("description") or "No details."
            code_links = bug.get("codeLinks") if isinstance(bug.get("codeLinks"), list) else []
            code_note = ""
            if code_links:
                labels = [
                    str(link.get("label") or link.get("url"))
                    for link in code_links
                    if isinstance(link, dict) and (link.get("label") or link.get("url"))
                ]
                if labels:
                    code_note = f" Code: {', '.join(labels[:3])}."
            lines.append(f"- {bug.get('title')} [{bug.get('severity')}, {bug.get('status')}]: {notes}")
            if code_note:
                lines.append(f"  {code_note}")

    roadmap_items = snapshot.get("roadmapItems", [])
    if roadmap_items:
        lines.append("")
        lines.append("## Roadmap Items")
        for item in roadmap_items:
            notes = item.get("description") or "No description."
            lines.append(
                f"- {item.get('title')} [{item.get('phase')}, {item.get('priority')}, {item.get('status')}]: {notes}"
            )

    blog_articles = snapshot.get("blogArticles", [])
    if blog_articles:
        lines.append("")
        lines.append("## Blogs Hub")
        for article in blog_articles:
            detail = article.get("thesis") or article.get("summary") or "No thesis yet."
            lines.append(
                f"- {article.get('title')} [{article.get('roadmapPhase')}, {article.get('priority')}, {article.get('status')}]: "
                f"{detail} ({article.get('evidenceCount', 0)} evidence card(s))"
            )

    accounts = snapshot.get("accounts", [])
    open_leads = snapshot.get("openLeads", [])
    follow_ups_due = snapshot.get("followUpsDue", [])
    if accounts or open_leads:
        lines.append("")
        lines.append("## Growth Pipeline")
        growth_counts = snapshot.get("growthCounts", {})
        lines.append(
            f"- accounts: {growth_counts.get('accounts', 0)} | open leads: {growth_counts.get('openLeads', 0)} | follow-ups due: {growth_counts.get('followUpsDue', 0)}"
        )
        if follow_ups_due:
            lines.append("- Due follow-ups:")
            for lead in follow_ups_due[:8]:
                label = lead.get("name") or lead.get("email") or lead.get("id")
                action = lead.get("nextAction") or "Follow up"
                lines.append(f"  - {label} [{lead.get('stage')}, {lead.get('priority')}]: {action}")
        elif open_leads:
            lines.append("- Open leads:")
            for lead in open_leads[:8]:
                label = lead.get("name") or lead.get("email") or lead.get("id")
                company = lead.get("companyName") or lead.get("accountId") or "No company"
                lines.append(f"  - {label} ({company}) [{lead.get('stage')}, {lead.get('priority')}]")

    environments = snapshot.get("environments", [])
    if environments:
        lines.append("")
        lines.append("## Environments")
        for env in environments:
            label = env.get("name") or env.get("id")
            status = env.get("status") or "unknown"
            version = env.get("version") or "n/a"
            lines.append(f"- {label}: {status} (version {version})")

    prompts = snapshot.get("latestPrompts", [])
    if prompts:
        lines.append("")
        lines.append("## Latest Prompts")
        for prompt in prompts:
            preview = prompt.get("contentPreview") or "No content preview."
            lines.append(f"- {prompt.get('title')} [{prompt.get('version')}]: {preview}")

    if snapshot.get("latestFeedback"):
        lines.append("")
        lines.append("## Latest Feedback")
        for feedback in snapshot["latestFeedback"]:
            lines.append(f"- {feedback.get('source')} [{feedback.get('sentiment')}]: {feedback.get('content')}")

    if snapshot.get("latestSeoKeywords"):
        lines.append("")
        lines.append("## SEO Keywords")
        for keyword in snapshot["latestSeoKeywords"]:
            lines.append(f"- {keyword.get('keyword')} [{keyword.get('intent')}]")

    if snapshot.get("latestSocialPosts"):
        lines.append("")
        lines.append("## Social Posts")
        for post in snapshot["latestSocialPosts"]:
            lines.append(f"- {post.get('platform')} [{post.get('status')}]: {post.get('content')}")

    if snapshot.get("creativeItems"):
        lines.append("")
        lines.append("## Creative Hub")
        for item in snapshot["creativeItems"]:
            detail = item.get("hook") or item.get("brief") or "No brief yet."
            lines.append(
                f"- {item.get('title')} [{item.get('platform')}, {item.get('format')}, {item.get('status')}]: {detail}"
            )

    notes = snapshot.get("notes", [])
    if notes:
        lines.append("")
        lines.append("## Notes")
        for note in notes:
            lines.append(f"- {note}")

    warnings = snapshot.get("warnings", [])
    if warnings:
        lines.append("")
        lines.append("## Warnings")
        for warning in warnings:
            lines.append(f"- {warning}")

    return "\n".join(lines)


def _render_json_resource(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=True)


async def _build_workspace_context(
    context: Context,
    *,
    scope: ContextScope = "auto",
    open_task_limit: int = 12,
    refresh: bool = False,
) -> dict[str, Any]:
    runtime = _runtime(context)
    limits = CONTEXT_SCOPE_LIMITS[scope]
    open_task_limit = _ensure_limit(open_task_limit, default=12, maximum=50)
    cache_key = _build_context_cache_key(scope, open_task_limit)

    if not refresh:
        cached = runtime.context_cache.get(cache_key)
        if cached:
            age_seconds = (_utc_now() - cached.fetched_at).total_seconds()
            if age_seconds <= runtime.context_cache_ttl_seconds:
                return cached.payload

    resource_calls = {
        "companies": _list_resource(context, "companies", limit=1),
        "users": _list_resource(context, "users", limit=25),
        "bugs": _list_resource(context, "bugs", limit=limits["bugs"]),
        "roadmap-items": _list_resource(context, "roadmap-items", limit=limits["roadmap-items"]),
        "blog-articles": _list_resource(context, "blog-articles", limit=limits["blog-articles"]),
        "visions": _list_resource(context, "visions", limit=limits["visions"]),
        "cycle-goals": _list_resource(context, "cycle-goals", limit=limits["cycle-goals"]),
        "tasks": _list_resource(context, "tasks", limit=limits["tasks"]),
        "environments": _list_resource(context, "environments", limit=10),
        "prompts": _list_resource(context, "prompts", limit=limits["prompts"]),
        "feedbacks": _list_resource(context, "feedbacks", limit=limits["feedbacks"]),
        "accounts": _list_resource(context, "accounts", limit=limits["accounts"]),
        "leads": _list_resource(context, "leads", limit=limits["leads"]),
        "social-posts": _list_resource(context, "social-posts", limit=limits["social-posts"]),
        "creative-items": _list_resource(context, "creative-items", limit=limits["creative-items"]),
        "seo-keywords": _list_resource(context, "seo-keywords", limit=limits["seo-keywords"]),
    }

    keys = list(resource_calls.keys())
    values = await asyncio.gather(*resource_calls.values(), return_exceptions=True)

    loaded: dict[str, list[dict[str, Any]]] = {}
    warnings: list[str] = []
    for key, value in zip(keys, values, strict=True):
        if isinstance(value, Exception):
            warnings.append(f"Failed to load {key}: {value}")
            loaded[key] = []
            continue
        loaded[key] = value

    company = _compact_company(_first(loaded["companies"]))
    users = [_compact_user(item) for item in loaded["users"]]
    bugs = [_compact_bug(item) for item in loaded["bugs"]]
    roadmap_items = [_compact_roadmap_item(item) for item in loaded["roadmap-items"]]
    blog_articles = [_compact_blog_article(item) for item in loaded["blog-articles"]]
    visions = [_compact_vision(item) for item in loaded["visions"]]
    cycle_goals = [_compact_cycle_goal(item) for item in loaded["cycle-goals"]]
    active_cycle_goals = [item for item in cycle_goals if item.get("status") == "active"]
    environments = [_compact_environment(item) for item in loaded["environments"]]
    prompts = [_compact_prompt(item) for item in loaded["prompts"]]
    feedbacks = [_compact_feedback(item) for item in loaded["feedbacks"]]
    accounts = [_compact_account(item) for item in loaded["accounts"]]
    leads = [_compact_lead(item) for item in loaded["leads"]]
    social_posts = [_compact_social_post(item) for item in loaded["social-posts"]]
    creative_items = [_compact_creative_item(item) for item in loaded["creative-items"]]
    seo_keywords = [_compact_seo_keyword(item) for item in loaded["seo-keywords"]]

    raw_tasks = loaded["tasks"]
    task_counts = dict(Counter(str(item.get("status")) for item in raw_tasks if item.get("status")))
    sorted_tasks = _sort_tasks_for_execution(raw_tasks)
    open_tasks = [
        _compact_task(item)
        for item in sorted_tasks
        if item.get("status") in {"todo", "in-progress", "icebox"}
    ][:open_task_limit]
    recent_done_tasks = [
        _compact_task(item)
        for item in raw_tasks
        if item.get("status") == "done"
    ][:5]

    lead_counts = dict(Counter(str(item.get("stage")) for item in leads if item.get("stage")))
    open_leads = [item for item in leads if item.get("stage") not in {"won", "lost"}]
    follow_ups_due = [
        item
        for item in open_leads
        if (next_action_at := _parse_iso_datetime(item.get("nextActionAt"))) and next_action_at <= _utc_now()
    ]
    follow_ups_due.sort(key=lambda item: str(item.get("nextActionAt") or ""))

    notes = _context_notes(
        company=company,
        active_cycle_goals=active_cycle_goals,
        open_tasks=open_tasks,
        bugs=bugs,
        roadmap_items=roadmap_items,
        blog_articles=blog_articles,
        visions=visions,
        leads=leads,
        environments=environments,
    )

    snapshot: dict[str, Any] = {
        "scope": scope,
        "generatedAt": _utc_now_iso(),
        "company": company,
        "team": users,
        "bugs": bugs,
        "roadmapItems": roadmap_items,
        "blogArticles": blog_articles,
        "blogCounts": dict(Counter(str(item.get("status")) for item in blog_articles if item.get("status"))),
        "blogsByRoadmapPhase": {
            phase: [item for item in blog_articles if item.get("roadmapPhase") == phase]
            for phase in ["now", "next", "later"]
        },
        "visions": visions,
        "activeCycleGoals": active_cycle_goals,
        "taskCounts": task_counts,
        "openTasks": open_tasks,
        "recentDoneTasks": recent_done_tasks,
        "latestPrompts": prompts,
        "environments": environments,
        "latestFeedback": feedbacks,
        "accounts": accounts,
        "openLeads": open_leads[:20],
        "followUpsDue": follow_ups_due[:20],
        "growthCounts": {
            "accounts": len(accounts),
            "openLeads": len(open_leads),
            "followUpsDue": len(follow_ups_due),
            "byStage": lead_counts,
        },
        "latestSocialPosts": social_posts,
        "creativeItems": creative_items,
        "creativeCounts": dict(Counter(str(item.get("status")) for item in creative_items if item.get("status"))),
        "latestSeoKeywords": seo_keywords,
        "notes": notes,
        "warnings": warnings,
    }
    snapshot["markdown"] = _render_context_markdown(snapshot)

    runtime.context_cache[cache_key] = CacheEntry(fetched_at=_utc_now(), payload=snapshot)
    return snapshot


async def _create_record(context: Context, resource: ResourceName, payload: dict[str, Any]) -> dict[str, Any]:
    return await _request(context, "POST", f"/api/v1/{resource}", body=payload)


async def _update_record_with_fallback(
    context: Context,
    resource: ResourceName,
    record_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    try:
        return await _request(context, "PATCH", f"/api/v1/{resource}/{record_id}", body=payload)
    except RuntimeError as error:
        if not str(error).startswith("404"):
            raise

    current_payload = await _get_record_with_fallback(context, resource, record_id)
    current = current_payload.get("data") if isinstance(current_payload.get("data"), dict) else {}
    differences = _patch_diff(current, payload)

    if not differences:
        return {
            "ok": True,
            "noop": True,
            "resource": resource,
            "recordId": record_id,
            "data": current,
            "note": "Production PATCH by id returned 404, but the record already matches the requested state.",
            "fallback": current_payload.get("fallback"),
        }

    return {
        "ok": False,
        "resource": resource,
        "recordId": record_id,
        "data": current,
        "attemptedPatch": payload,
        "differences": differences,
        "error": "404 Production update-by-id is currently unavailable.",
        "note": "The MCP server verified the current record and confirmed the requested changes were not applied.",
        "fallback": current_payload.get("fallback"),
    }


async def _add_context_excerpt(
    _context: Context,
    payload: dict[str, Any],
    *,
    scope: ContextScope,
    refresh: bool = False,
) -> dict[str, Any]:
    """Attach a stable empty routing envelope when contextual routing is unavailable."""
    if payload.get("relatedContext") is not None:
        return payload
    return {
        **payload,
        "relatedContext": {
            "attached": [],
            "suggestions": [],
            "hasMore": False,
        },
        "routing": {
            "scope": scope,
            "refreshRequested": refresh,
            "available": False,
        },
    }


async def _route_write_result(
    context: Context,
    resource: ResourceName,
    payload: dict[str, Any],
    *,
    record_id: str | None = None,
) -> dict[str, Any]:
    if payload.get("relatedContext") is not None and payload.get("routing") is not None:
        return payload

    data = payload.get("data")
    resolved_id = record_id
    if resolved_id is None and isinstance(data, dict):
        value = data.get("id")
        resolved_id = str(value) if value else None
    if not resolved_id:
        return payload

    routed = await _get_record_with_fallback(context, resource, resolved_id)
    return {
        **payload,
        "data": routed.get("data", data),
        "relatedContext": routed.get("relatedContext", {
            "attached": [],
            "suggestions": [],
            "hasMore": False,
        }),
        "routing": routed.get("routing"),
    }


@asynccontextmanager
async def replofy_lifespan(_server: FastMCP):
    base_url = os.getenv("REPLOFY_OS_BASE_URL", "http://localhost:4000").rstrip("/")
    api_key = _require_env("REPLOFY_OS_API_KEY")
    timeout_seconds = float(os.getenv("REPLOFY_OS_TIMEOUT_SECONDS", "30"))
    context_cache_ttl_seconds = float(os.getenv("REPLOFY_OS_CONTEXT_CACHE_SECONDS", "30"))
    client = httpx.AsyncClient(base_url=base_url, timeout=timeout_seconds, follow_redirects=True)

    try:
        yield ReplofyRuntime(
            base_url=base_url,
            api_key=api_key,
            timeout_seconds=timeout_seconds,
            client=client,
            context_cache_ttl_seconds=context_cache_ttl_seconds,
        )
    finally:
        await client.aclose()


mcp = FastMCP("Replofy OS", lifespan=replofy_lifespan)


@mcp.resource("replofy://config")
async def replofy_config() -> str:
    """Return MCP-specific configuration, schema hints, and the recommended startup flow."""
    return _render_json_resource({
        "baseUrl": os.getenv("REPLOFY_OS_BASE_URL", "http://localhost:4000").rstrip("/"),
        "resources": RESOURCES,
        "recommendedResources": [
            "replofy://context/auto",
            "replofy://context/execution",
            "replofy://context/strategy",
            "replofy://context/content",
            "replofy://blogs/roadmap",
            "replofy://skills/registry",
            "replofy://resource/tasks/latest/20",
            "replofy://resource/bugs/latest/20",
            "replofy://resource/roadmap-items/latest/20",
            "replofy://resource/blog-articles/latest/20",
            "replofy://resource/creative-items/latest/20",
            "replofy://resource/leads/latest/20",
            "replofy://resource/accounts/latest/20",
            "replofy://resource/team-chat-channels/latest/20",
        ],
        "recommendedTools": [
            "get_record",
            "get_workspace_context",
            "list_records",
            "create_record",
            "update_record",
            "delete_record",
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
            "list_team_chat_messages",
            "post_team_chat_message",
            "register_team_chat_participant",
            "add_team_chat_participant_to_channel",
            "create_task",
            "create_focus_stack",
        ],
        "resourceGuide": RESOURCE_GUIDE,
        "skillRegistry": {
            "uri": "replofy://skills/registry",
            "skillTemplate": "replofy://skills/{skill_name}",
            "directory": str(_skills_dir()),
        },
        "notes": [
            "When an object id is known, use get_record so that object becomes the context anchor.",
            "Use replofy://context/auto or workspace_briefing only for startup or when no object anchor exists.",
            "Bugs and roadmap items are generic CRUD resources. Use list_records, create_record, update_record, and delete_record to manage them.",
            "Growth Pipeline accounts and leads have dedicated tools plus generic CRUD support through accounts and leads resources.",
            "Creative Hub items are available through generic CRUD; creative assets are available as read-only metadata.",
            "Blogs Hub has a dedicated roadmap resource and tools for structured article planning, evidence, sources, and publishing workflow.",
            "The local Replofy OS skill registry is available at replofy://skills/registry, with individual definitions at replofy://skills/{skill_name}.",
            "Team Chat has dedicated tools for named human and AI-agent identities, atomic channel membership, posting, and time-filtered reads.",
            "create_task and create_seo_keyword can auto-attach the single active cycle goal when unambiguous.",
        ],
    })


@mcp.resource("replofy://context/auto")
async def replofy_auto_context(context: Context) -> str:
    """Return the default live workspace context for planning and execution."""
    snapshot = await _build_workspace_context(context, scope="auto")
    return snapshot["markdown"]


@mcp.resource("replofy://context/execution")
async def replofy_execution_context(context: Context) -> str:
    """Return execution-focused context with active goals, open tasks, and environments."""
    snapshot = await _build_workspace_context(context, scope="execution")
    return snapshot["markdown"]


@mcp.resource("replofy://context/strategy")
async def replofy_strategy_context(context: Context) -> str:
    """Return strategy-focused context with visions, goals, prompts, and feedback."""
    snapshot = await _build_workspace_context(context, scope="strategy")
    return snapshot["markdown"]


@mcp.resource("replofy://context/content")
async def replofy_content_context(context: Context) -> str:
    """Return content-focused context with Blogs Hub, prompts, SEO, social, and creative planning."""
    snapshot = await _build_workspace_context(context, scope="content")
    return snapshot["markdown"]


@mcp.resource("replofy://blogs/roadmap")
async def replofy_blogs_roadmap(context: Context) -> str:
    """Expose Blogs Hub articles grouped by roadmap phase."""
    records = await _list_resource(context, "blog-articles", limit=200)
    articles = [_compact_blog_article(record) for record in records]
    return _render_json_resource({
        "resource": "blog-articles",
        "count": len(articles),
        "byRoadmapPhase": {
            phase: [article for article in articles if article.get("roadmapPhase") == phase]
            for phase in ["now", "next", "later"]
        },
        "articles": articles,
    })


@mcp.resource("replofy://skills/registry")
async def replofy_skills_registry() -> str:
    """Expose the local Replofy OS workspace skill registry."""
    return _render_json_resource(_skill_registry())


@mcp.resource("replofy://skills/{skill_name}")
async def replofy_skill(skill_name: str) -> str:
    """Expose one local Replofy OS skill definition."""
    return _read_skill(skill_name)["markdown"]


@mcp.resource("replofy://resource/{resource}/latest/{limit}")
async def replofy_resource_listing(resource: str, limit: int, context: Context) -> str:
    """Expose a compact listing for any Replofy resource as a resource template."""
    normalized_resource = _normalize_resource_name(resource)
    records = await _list_resource(context, normalized_resource, limit=_ensure_limit(limit, default=20))
    return _render_json_resource({
        "resource": normalized_resource,
        "count": len(records),
        "items": [_compact_record(normalized_resource, record) for record in records],
    })


@mcp.resource("replofy://record/{resource}/{record_id}")
async def replofy_record(resource: str, record_id: str, context: Context) -> str:
    """Expose one record with compact deterministic related context."""
    return _render_json_resource(await _get_record_with_fallback(context, _normalize_resource_name(resource), record_id))


@mcp.resource("replofy://team-chat/channel/{channel_id}/latest/{limit}")
async def replofy_team_chat_channel(channel_id: str, limit: int, context: Context) -> str:
    """Expose bounded recent messages for one Team Chat channel."""
    payload = await _request(
        context,
        "GET",
        "/api/v1/team-chat/messages",
        query={"channelId": channel_id, "limit": _ensure_limit(limit, default=50, maximum=200)},
    )
    return _render_json_resource(payload)


@mcp.prompt("workspace_briefing")
async def workspace_briefing(scope: str = "auto", context: Context | None = None) -> str:
    """Build a broad startup or no-anchor fallback briefing."""
    if context is None:
        raise RuntimeError("Context injection is required for workspace_briefing.")
    snapshot = await _build_workspace_context(context, scope=_normalize_scope(scope), refresh=True)
    return (
        "You are connected to Replofy OS through MCP.\n"
        "Use the following live workspace context as a startup or no-anchor fallback.\n\n"
        f"{snapshot['markdown']}\n\n"
        "When creating new work, prefer attaching it to the active cycle goal when that is unambiguous. "
        "For Growth Pipeline work, use accounts and leads with manual task links only."
        " For content planning, use Blogs Hub records with roadmap phases, evidence cards, and linked sources."
    )


@mcp.tool()
async def server_status(context: Context) -> dict[str, Any]:
    """Fetch the Replofy API index and include MCP-specific guidance for agent startup."""
    payload = await _request(context, "GET", "/api/v1")
    payload["mcp"] = {
        "recommendedFirstToolWhenObjectIdKnown": "get_record",
        "fallbackToolWhenNoObjectAnchorExists": "get_workspace_context",
        "fallbackReadWhenNoObjectAnchorExists": "replofy://context/auto",
        "supportsAutomaticContext": True,
        "skillsRegistry": "replofy://skills/registry",
    }
    return payload


@mcp.tool()
async def describe_resource(resource: str) -> dict[str, Any]:
    """Return resource-specific filter fields, create fields, and behavioral notes."""
    normalized_resource = _normalize_resource_name(resource)
    return {
        "resource": normalized_resource,
        "guide": RESOURCE_GUIDE.get(normalized_resource, {}),
    }


@mcp.tool()
async def get_workspace_context(
    context: Context,
    scope: str = "auto",
    open_task_limit: int = 12,
    refresh: bool = False,
) -> dict[str, Any]:
    """Load a broad startup or no-anchor fallback workspace snapshot."""
    await context.report_progress(1, 3, "Loading Replofy workspace context")
    snapshot = await _build_workspace_context(
        context,
        scope=scope,
        open_task_limit=open_task_limit,
        refresh=refresh,
    )
    await context.report_progress(2, 3, "Workspace context assembled")
    result = dict(snapshot)
    result["recommendedNextSteps"] = [
        "Use create_task to add delivery work.",
        "Use list_leads or list_accounts when planning Growth Pipeline follow-up.",
        "Use list_blog_articles or replofy://blogs/roadmap for content roadmap work.",
        "Read replofy://skills/registry when you need a Replofy OS workspace skill.",
        "Use create_focus_stack to create a vision, cycle goal, and linked tasks together.",
        "Use replofy://context/execution if you need a text briefing instead of JSON.",
    ]
    await context.report_progress(3, 3, "Context ready")
    return result


@mcp.tool()
async def list_records(
    resource: str,
    context: Context,
    limit: int = 50,
    filters: dict[str, Any] | str | None = None,
) -> dict[str, Any]:
    """List records from a Replofy resource. Use filters for fields like status, role, platform, or companyId."""
    normalized_resource = _normalize_resource_name(resource)
    normalized_filters = _normalize_filters(filters)
    records = await _list_resource(context, normalized_resource, limit=limit, filters=normalized_filters)
    return {
        "resource": normalized_resource,
        "count": len(records),
        "filters": normalized_filters or {},
        "data": records,
        "compact": [_compact_record(normalized_resource, record) for record in records],
    }


@mcp.tool()
async def get_record(
    resource: str,
    record_id: str,
    context: Context,
    debug: bool = False,
) -> dict[str, Any]:
    """Fetch one record by id with compact deterministic related context."""
    return await _get_record_with_fallback(
        context,
        _normalize_resource_name(resource),
        record_id,
        debug=debug,
    )


@mcp.tool()
async def download_creative_asset(asset_id: str, context: Context) -> dict[str, Any]:
    """Create an authenticated download URL for one active Creative Hub asset."""
    return await _request(
        context,
        "GET",
        f"/api/v1/creative-assets/{quote(asset_id, safe='')}/download",
    )


@mcp.tool()
async def create_record(resource: str, payload: dict[str, Any], context: Context) -> dict[str, Any]:
    """Create a new record in a Replofy resource using the resource-specific JSON payload."""
    normalized_resource = _normalize_resource_name(resource)
    result = await _create_record(context, normalized_resource, payload)
    return await _route_write_result(context, normalized_resource, result)


@mcp.tool()
async def update_record(
    resource: str,
    record_id: str,
    payload: dict[str, Any],
    context: Context,
) -> dict[str, Any]:
    """Update an existing Replofy record by id using a partial JSON payload."""
    normalized_resource = _normalize_resource_name(resource)
    result = await _update_record_with_fallback(context, normalized_resource, record_id, payload)
    return await _route_write_result(context, normalized_resource, result, record_id=record_id)


@mcp.tool()
async def delete_record(resource: str, record_id: str, context: Context) -> dict[str, Any]:
    """Delete a Replofy record by id. The production API currently may return 404 for valid ids."""
    normalized_resource = _normalize_resource_name(resource)
    try:
        result = await _request(context, "DELETE", f"/api/v1/{normalized_resource}/{record_id}")
    except RuntimeError as error:
        if not str(error).startswith("404"):
            raise
        return {
            "ok": False,
            "resource": normalized_resource,
            "recordId": record_id,
            "error": str(error),
            "note": "Production delete-by-id is currently returning 404. The record may still exist.",
        }

    return result


@mcp.tool()
async def list_blog_articles(
    context: Context,
    status: str | None = None,
    roadmap_phase: str | None = None,
    priority: str | None = None,
    owner_id: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """List Blogs Hub articles, optionally filtered by workflow state, roadmap phase, priority, or owner."""
    filters: dict[str, Any] = {}
    if status is not None:
        filters["status"] = status
    if roadmap_phase is not None:
        filters["roadmapPhase"] = roadmap_phase
    if priority is not None:
        filters["priority"] = priority
    if owner_id is not None:
        filters["ownerId"] = owner_id

    records = await _list_resource(
        context,
        "blog-articles",
        limit=_ensure_limit(limit, default=50, maximum=200),
        filters=filters or None,
    )
    return {
        "resource": "blog-articles",
        "count": len(records),
        "filters": filters,
        "data": records,
        "compact": [_compact_blog_article(record) for record in records],
    }


@mcp.tool()
async def create_blog_article(
    title: str,
    context: Context,
    slug: str | None = None,
    summary: str = "",
    content: str = "",
    status: str = "idea",
    roadmap_phase: str = "next",
    priority: str = "medium",
    owner_id: str | None = None,
    target_publish_at: str | None = None,
    scheduled_for: str | None = None,
    brief: dict[str, Any] | None = None,
    evidence: list[dict[str, Any]] | None = None,
    linked_source_ids: list[str] | None = None,
    distribution: dict[str, Any] | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """Create a structured Blogs Hub article with roadmap, brief, evidence, source, and distribution metadata."""
    payload: dict[str, Any] = {
        "title": title,
        "summary": summary,
        "content": content,
        "status": status,
        "roadmapPhase": roadmap_phase,
        "priority": priority,
        "brief": brief or {},
        "evidence": evidence or [],
        "linkedSourceIds": linked_source_ids or [],
        "distribution": distribution or {},
        "tags": tags or [],
    }
    _put_if_present(payload, "slug", slug)
    _put_if_present(payload, "ownerId", owner_id)
    _put_if_present(payload, "targetPublishAt", target_publish_at)
    _put_if_present(payload, "scheduledFor", scheduled_for)

    result = await _create_record(context, "blog-articles", payload)
    return await _add_context_excerpt(context, result, scope="content", refresh=True)


@mcp.tool()
async def update_blog_article(
    article_id: str,
    patch: dict[str, Any],
    context: Context,
) -> dict[str, Any]:
    """Update a Blogs Hub article by id using a structured partial patch."""
    result = await _update_record_with_fallback(context, "blog-articles", article_id, patch)
    return await _add_context_excerpt(context, result, scope="content", refresh=True)


@mcp.tool()
async def list_skill_registry() -> dict[str, Any]:
    """List local workspace skills registered for Replofy OS agents."""
    return _skill_registry()


@mcp.tool()
async def get_skill(skill_name: str) -> dict[str, Any]:
    """Read one local Replofy OS workspace skill definition."""
    return _read_skill(skill_name)


@mcp.tool()
async def create_cycle_goal(
    title: str,
    context: Context,
    description: str = "",
    status: str = "active",
) -> dict[str, Any]:
    """Create a cycle goal and return updated execution context."""
    result = await _create_record(
        context,
        "cycle-goals",
        {
            "title": title,
            "description": description,
            "status": status,
        },
    )
    return await _route_write_result(context, "cycle-goals", result)


@mcp.tool()
async def create_vision(
    title: str,
    description: str,
    context: Context,
    focus_items: list[str] | None = None,
) -> dict[str, Any]:
    """Create a vision document and return updated strategy context."""
    result = await _create_record(
        context,
        "visions",
        {
            "title": title,
            "description": description,
            "focusItems": focus_items or [],
        },
    )
    return await _route_write_result(context, "visions", result)


@mcp.tool()
async def create_task(
    title: str,
    context: Context,
    effort_points: int = 1,
    is_lead_indicator: bool = False,
    status: str | None = None,
    cycle_goal_id: str | None = None,
    assignee_id: str | None = None,
    auto_attach_active_cycle_goal: bool = True,
) -> dict[str, Any]:
    """Create a task. When cycle_goal_id is omitted, the tool can auto-attach the single active cycle goal."""
    resolved_cycle_goal_id, notes, resolved_goal = await _resolve_cycle_goal_assignment(
        context,
        cycle_goal_id=cycle_goal_id,
        auto_attach_active=auto_attach_active_cycle_goal,
    )

    payload: dict[str, Any] = {
        "title": title,
        "effortPoints": effort_points,
        "isLeadIndicator": is_lead_indicator,
    }
    if status is not None:
        payload["status"] = status
    if resolved_cycle_goal_id is not None:
        payload["cycleGoalId"] = resolved_cycle_goal_id
    if assignee_id is not None:
        payload["assigneeId"] = assignee_id

    result = await _request(context, "POST", "/api/v1/tasks", body=payload)
    enriched = await _route_write_result(context, "tasks", result)
    enriched["resolvedCycleGoal"] = resolved_goal
    enriched["notes"] = notes
    return enriched


@mcp.tool()
async def update_task(
    task_id: str,
    context: Context,
    title: str | None = None,
    status: str | None = None,
    effort_points: int | None = None,
    is_lead_indicator: bool | None = None,
    cycle_goal_id: str | None = None,
    assignee_id: str | None = None,
) -> dict[str, Any]:
    """Update a task with one or more changed fields."""
    payload: dict[str, Any] = {}
    if title is not None:
        payload["title"] = title
    if status is not None:
        payload["status"] = status
    if effort_points is not None:
        payload["effortPoints"] = effort_points
    if is_lead_indicator is not None:
        payload["isLeadIndicator"] = is_lead_indicator
    if cycle_goal_id is not None:
        payload["cycleGoalId"] = cycle_goal_id
    if assignee_id is not None:
        payload["assigneeId"] = assignee_id

    result = await _update_record_with_fallback(context, "tasks", task_id, payload)
    return await _route_write_result(context, "tasks", result, record_id=task_id)


@mcp.tool()
async def set_task_status(task_id: str, status: str, context: Context) -> dict[str, Any]:
    """Set one task status without building a patch payload manually."""
    return await update_task(task_id=task_id, context=context, status=status)


@mcp.tool()
async def find_tasks(
    context: Context,
    title_contains: str | None = None,
    status: str | None = None,
    assignee_id: str | None = None,
    cycle_goal_id: str | None = None,
    limit: int = 25,
) -> dict[str, Any]:
    """Find tasks with simple task-specific filters instead of the generic list_records interface."""
    filters: dict[str, Any] = {}
    if status is not None:
        filters["status"] = status
    if assignee_id is not None:
        filters["assigneeId"] = assignee_id
    if cycle_goal_id is not None:
        filters["cycleGoalId"] = cycle_goal_id

    records = await _list_resource(context, "tasks", limit=limit, filters=filters or None)
    if title_contains:
        needle = title_contains.strip().lower()
        records = [item for item in records if needle in str(item.get("title", "")).lower()]

    return {
        "resource": "tasks",
        "count": len(records),
        "filters": filters,
        "titleContains": title_contains,
        "data": records,
        "compact": [_compact_task(record) for record in records],
    }


@mcp.tool()
async def list_leads(
    context: Context,
    stage: str | None = None,
    source: str | None = None,
    priority: str | None = None,
    owner_id: str | None = None,
    account_id: str | None = None,
    limit: int = 25,
) -> dict[str, Any]:
    """List Growth Pipeline leads, optionally filtered by stage, source, priority, owner, or account."""
    filters: dict[str, Any] = {}
    if stage is not None:
        filters["stage"] = stage
    if source is not None:
        filters["source"] = source
    if priority is not None:
        filters["priority"] = priority
    if owner_id is not None:
        filters["ownerId"] = owner_id
    if account_id is not None:
        filters["accountId"] = account_id

    records = await _list_resource(
        context,
        "leads",
        limit=_ensure_limit(limit, default=25, maximum=100),
        filters=filters or None,
    )
    return {
        "resource": "leads",
        "count": len(records),
        "filters": filters,
        "data": records,
        "compact": [_compact_lead(record) for record in records],
    }


@mcp.tool()
async def create_lead(
    name: str,
    context: Context,
    email: str | None = None,
    company_name: str | None = None,
    account_id: str | None = None,
    source: str = "inbound",
    stage: str = "new",
    priority: str = "medium",
    owner_id: str | None = None,
    next_action: str | None = None,
    next_action_at: str | None = None,
    notes: str | None = None,
    linked_task_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Create a Growth Pipeline lead. Task links are manual id links only."""
    payload: dict[str, Any] = {
        "name": name,
        "source": source,
        "stage": stage,
        "priority": priority,
    }
    _put_if_present(payload, "email", email)
    _put_if_present(payload, "companyName", company_name)
    _put_if_present(payload, "accountId", account_id)
    _put_if_present(payload, "ownerId", owner_id)
    _put_if_present(payload, "nextAction", next_action)
    _put_if_present(payload, "nextActionAt", next_action_at)
    _put_if_present(payload, "notes", notes)
    if linked_task_ids is not None:
        payload["linkedTaskIds"] = linked_task_ids

    result = await _create_record(context, "leads", payload)
    return await _route_write_result(context, "leads", result)


@mcp.tool()
async def update_lead(
    lead_id: str,
    context: Context,
    name: str | None = None,
    email: str | None = None,
    company_name: str | None = None,
    account_id: str | None = None,
    source: str | None = None,
    stage: str | None = None,
    priority: str | None = None,
    owner_id: str | None = None,
    next_action: str | None = None,
    next_action_at: str | None = None,
    notes: str | None = None,
    linked_task_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Update a Growth Pipeline lead by id."""
    payload: dict[str, Any] = {}
    _put_if_present(payload, "name", name)
    _put_if_present(payload, "email", email)
    _put_if_present(payload, "companyName", company_name)
    _put_if_present(payload, "accountId", account_id)
    _put_if_present(payload, "source", source)
    _put_if_present(payload, "stage", stage)
    _put_if_present(payload, "priority", priority)
    _put_if_present(payload, "ownerId", owner_id)
    _put_if_present(payload, "nextAction", next_action)
    _put_if_present(payload, "nextActionAt", next_action_at)
    _put_if_present(payload, "notes", notes)
    if linked_task_ids is not None:
        payload["linkedTaskIds"] = linked_task_ids

    result = await _update_record_with_fallback(context, "leads", lead_id, payload)
    return await _route_write_result(context, "leads", result, record_id=lead_id)


@mcp.tool()
async def list_accounts(
    context: Context,
    status: str | None = None,
    limit: int = 25,
) -> dict[str, Any]:
    """List Growth Pipeline accounts, optionally filtered by account status."""
    filters: dict[str, Any] = {}
    if status is not None:
        filters["status"] = status

    records = await _list_resource(
        context,
        "accounts",
        limit=_ensure_limit(limit, default=25, maximum=100),
        filters=filters or None,
    )
    return {
        "resource": "accounts",
        "count": len(records),
        "filters": filters,
        "data": records,
        "compact": [_compact_account(record) for record in records],
    }


@mcp.tool()
async def create_account(
    name: str,
    context: Context,
    website: str | None = None,
    industry: str | None = None,
    size: str | None = None,
    notes: str | None = None,
    status: str = "prospect",
    linked_lead_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Create a Growth Pipeline account."""
    payload: dict[str, Any] = {
        "name": name,
        "status": status,
    }
    _put_if_present(payload, "website", website)
    _put_if_present(payload, "industry", industry)
    _put_if_present(payload, "size", size)
    _put_if_present(payload, "notes", notes)
    if linked_lead_ids is not None:
        payload["linkedLeadIds"] = linked_lead_ids

    result = await _create_record(context, "accounts", payload)
    return await _route_write_result(context, "accounts", result)


@mcp.tool()
async def update_account(
    account_id: str,
    context: Context,
    name: str | None = None,
    website: str | None = None,
    industry: str | None = None,
    size: str | None = None,
    notes: str | None = None,
    status: str | None = None,
    linked_lead_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Update a Growth Pipeline account by id."""
    payload: dict[str, Any] = {}
    _put_if_present(payload, "name", name)
    _put_if_present(payload, "website", website)
    _put_if_present(payload, "industry", industry)
    _put_if_present(payload, "size", size)
    _put_if_present(payload, "notes", notes)
    _put_if_present(payload, "status", status)
    if linked_lead_ids is not None:
        payload["linkedLeadIds"] = linked_lead_ids

    result = await _update_record_with_fallback(context, "accounts", account_id, payload)
    return await _route_write_result(context, "accounts", result, record_id=account_id)


@mcp.tool()
async def list_team_chat_channels(
    context: Context,
    status: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """List Team Chat channels, optionally filtered by active or archived status."""
    filters = {"status": status} if status is not None else None
    records = await _list_resource(
        context,
        "team-chat-channels",
        limit=_ensure_limit(limit, default=50, maximum=100),
        filters=filters,
    )
    return {
        "resource": "team-chat-channels",
        "count": len(records),
        "filters": filters or {},
        "data": records,
        "compact": [_compact_team_chat_channel(record) for record in records],
    }


@mcp.tool()
async def create_team_chat_channel(
    name: str,
    context: Context,
    topic: str | None = None,
    participant_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Create a Team Chat channel with an optional topic and initial identities."""
    payload: dict[str, Any] = {"name": name}
    _put_if_present(payload, "topic", topic)
    if participant_ids is not None:
        payload["participantIds"] = participant_ids
    return await _create_record(context, "team-chat-channels", payload)


@mcp.tool()
async def list_team_chat_participants(
    context: Context,
    participant_type: str | None = None,
    status: str | None = None,
    linked_user_id: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    """List named Team Chat identities for human team members and AI agents."""
    filters: dict[str, Any] = {}
    _put_if_present(filters, "participantType", participant_type)
    _put_if_present(filters, "status", status)
    _put_if_present(filters, "linkedUserId", linked_user_id)
    records = await _list_resource(
        context,
        "team-chat-participants",
        limit=_ensure_limit(limit, default=100, maximum=100),
        filters=filters or None,
    )
    return {
        "resource": "team-chat-participants",
        "count": len(records),
        "filters": filters,
        "data": records,
        "compact": [_compact_team_chat_participant(record) for record in records],
    }


@mcp.tool()
async def register_team_chat_participant(
    display_name: str,
    context: Context,
    participant_type: str = "ai-agent",
    linked_user_id: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """Register a custom-named human or AI-agent identity for Team Chat."""
    payload: dict[str, Any] = {
        "displayName": display_name,
        "participantType": participant_type,
    }
    _put_if_present(payload, "linkedUserId", linked_user_id)
    _put_if_present(payload, "description", description)
    return await _create_record(context, "team-chat-participants", payload)


@mcp.tool()
async def rename_team_chat_participant(
    participant_id: str,
    display_name: str,
    context: Context,
) -> dict[str, Any]:
    """Rename a Team Chat human or AI-agent identity while preserving historical message snapshots."""
    return await _update_record_with_fallback(
        context,
        "team-chat-participants",
        participant_id,
        {"displayName": display_name},
    )


@mcp.tool()
async def add_team_chat_participant_to_channel(
    channel_id: str,
    participant_id: str,
    context: Context,
) -> dict[str, Any]:
    """Atomically add a registered Team Chat identity to an active channel."""
    return await _request(
        context,
        "POST",
        f"/api/v1/team-chat/channels/{channel_id}/participants",
        body={"participantId": participant_id},
    )


@mcp.tool()
async def post_team_chat_message(
    channel_id: str,
    participant_id: str,
    content: str,
    context: Context,
    reply_to_message_id: str | None = None,
) -> dict[str, Any]:
    """Post an immutable Team Chat message as an identity already assigned to the channel."""
    payload: dict[str, Any] = {
        "channelId": channel_id,
        "participantId": participant_id,
        "content": content,
    }
    _put_if_present(payload, "replyToMessageId", reply_to_message_id)
    return await _create_record(context, "team-chat-messages", payload)


@mcp.tool()
async def list_team_chat_messages(
    context: Context,
    channel_id: str | None = None,
    participant_id: str | None = None,
    participant_type: str | None = None,
    sender_name: str | None = None,
    after: str | None = None,
    before: str | None = None,
    query: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """Read bounded Team Chat history with identity, ISO-8601 time-range, text-search, and pagination filters."""
    params: dict[str, Any] = {"limit": _ensure_limit(limit, default=50, maximum=200)}
    _put_if_present(params, "channelId", channel_id)
    _put_if_present(params, "participantId", participant_id)
    _put_if_present(params, "participantType", participant_type)
    _put_if_present(params, "senderName", sender_name)
    _put_if_present(params, "after", after)
    _put_if_present(params, "before", before)
    _put_if_present(params, "query", query)
    result = await _request(context, "GET", "/api/v1/team-chat/messages", query=params)
    records = _extract_records(result)
    result["compact"] = [_compact_team_chat_message(record) for record in records]
    return result


@mcp.tool()
async def create_prompt(
    title: str,
    content: str,
    context: Context,
    version: str = "v1.0",
) -> dict[str, Any]:
    """Create a prompt in the Replofy prompt bank."""
    result = await _request(
        context,
        "POST",
        "/api/v1/prompts",
        body={"title": title, "content": content, "version": version},
    )
    return await _route_write_result(context, "prompts", result)


@mcp.tool()
async def create_seo_keyword(
    keyword: str,
    context: Context,
    intent: str = "high",
    cycle_goal_id: str | None = None,
    auto_attach_active_cycle_goal: bool = True,
) -> dict[str, Any]:
    """Create an SEO keyword and optionally auto-link it to the single active cycle goal."""
    resolved_cycle_goal_id, notes, resolved_goal = await _resolve_cycle_goal_assignment(
        context,
        cycle_goal_id=cycle_goal_id,
        auto_attach_active=auto_attach_active_cycle_goal,
    )

    payload: dict[str, Any] = {
        "keyword": keyword,
        "intent": intent,
    }
    if resolved_cycle_goal_id is not None:
        payload["cycleGoalId"] = resolved_cycle_goal_id

    result = await _create_record(context, "seo-keywords", payload)
    enriched = await _route_write_result(context, "seo-keywords", result)
    enriched["resolvedCycleGoal"] = resolved_goal
    enriched["notes"] = notes
    return enriched


@mcp.tool()
async def create_focus_stack(
    vision_title: str,
    vision_description: str,
    cycle_goal_title: str,
    context: Context,
    cycle_goal_description: str = "",
    focus_items: list[str] | None = None,
    task_titles: list[str] | None = None,
    task_effort_points: int = 1,
    is_lead_indicator: bool = False,
) -> dict[str, Any]:
    """Create a vision, one cycle goal, and optional linked tasks as one coherent delivery stack."""
    await context.report_progress(1, 4, "Creating vision")
    vision = await _create_record(
        context,
        "visions",
        {
            "title": vision_title,
            "description": vision_description,
            "focusItems": focus_items or [],
        },
    )

    await context.report_progress(2, 4, "Creating cycle goal")
    cycle_goal = await _create_record(
        context,
        "cycle-goals",
        {
            "title": cycle_goal_title,
            "description": cycle_goal_description,
            "status": "active",
        },
    )

    cycle_goal_id = cycle_goal.get("data", {}).get("id")
    created_tasks: list[dict[str, Any]] = []
    if cycle_goal_id and task_titles:
        for index, task_title in enumerate(task_titles, start=1):
            await context.report_progress(2 + index / max(len(task_titles), 1), 4, f"Creating task {index}/{len(task_titles)}")
            task_result = await _request(
                context,
                "POST",
                "/api/v1/tasks",
                body={
                    "title": task_title,
                    "effortPoints": task_effort_points,
                    "isLeadIndicator": is_lead_indicator,
                    "cycleGoalId": cycle_goal_id,
                },
            )
            created_tasks.append(task_result.get("data", {}))

    await context.report_progress(4, 4, "Loading related context")
    routed_goal = (
        await _get_record_with_fallback(context, "cycle-goals", str(cycle_goal_id))
        if cycle_goal_id
        else {}
    )
    return {
        "vision": vision.get("data"),
        "cycleGoal": routed_goal.get("data", cycle_goal.get("data")),
        "tasks": created_tasks,
        "relatedContext": routed_goal.get("relatedContext"),
        "routing": routed_goal.get("routing"),
    }


@mcp.tool()
async def deploy_environment(environment_id: str, context: Context) -> dict[str, Any]:
    """Trigger the Replofy environment deploy action for a known environment id."""
    result = await _request(context, "POST", f"/api/v1/environments/{environment_id}/deploy")
    return await _route_write_result(context, "environments", result, record_id=environment_id)


@mcp.tool()
async def rollback_environment(environment_id: str, context: Context) -> dict[str, Any]:
    """Trigger the Replofy environment rollback action for a known environment id."""
    result = await _request(context, "POST", f"/api/v1/environments/{environment_id}/rollback")
    return await _route_write_result(context, "environments", result, record_id=environment_id)


@mcp.tool()
async def start_next_cycle(context: Context) -> dict[str, Any]:
    """Archive active cycle goals and move unfinished tasks back to the icebox."""
    return await _request(context, "POST", "/api/v1/cycles/start-next")


@mcp.tool()
async def get_weekly_changelog(context: Context, week: str = "current") -> dict[str, Any]:
    """Generate the markdown weekly changelog for the current or last week."""
    return await _request(context, "GET", "/api/v1/reports/changelog", query={"week": week})


@mcp.tool()
async def extract_context_document(
    file_name: str,
    content: str,
    context: Context,
    mime_type: str = "text/markdown",
) -> dict[str, Any]:
    """Run the Replofy extraction step and return the proposed structured payload without writing records."""
    await context.report_progress(1, 2, "Sending document for extraction")
    result = await _request(
        context,
        "POST",
        "/api/v1/context-ingestions/extract",
        body={"fileName": file_name, "content": content, "mimeType": mime_type},
    )
    await context.report_progress(2, 2, "Extraction finished")
    return result


@mcp.tool()
async def ingest_context_document(
    file_name: str,
    content: str,
    context: Context,
    mime_type: str = "text/markdown",
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Ingest a document into Replofy context. Optionally pass a reviewed payload to bypass automatic extraction."""
    await context.report_progress(1, 3, "Preparing ingestion payload")
    body: dict[str, Any] = {"fileName": file_name, "content": content, "mimeType": mime_type}
    if payload is not None:
        body["payload"] = payload
    await context.report_progress(2, 3, "Submitting document to Replofy")
    result = await _request(context, "POST", "/api/v1/context-ingestions", body=body)
    await context.report_progress(3, 3, "Ingestion completed")
    return result


@mcp.tool()
async def replofy_request(
    method: str,
    path: str,
    context: Context,
    query: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Send a raw request to the secured Replofy API. Use this as a fallback for routes not wrapped by dedicated tools."""
    normalized_path = path if path.startswith("/api/") else f"/api/v1/{path.lstrip('/')}"
    return await _request(context, method, normalized_path, query=query, body=body)


if __name__ == "__main__":
    mcp.run()
