from __future__ import annotations

import json
import hmac
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any, Annotated

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

DATA_DIR = Path(os.environ.get("REPLOFY_MEMORY_DATA", "/var/lib/replofy/memory"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
STATE_DB = DATA_DIR / "replofy-memory.sqlite3"
SERVICE_TOKEN = os.environ.get("REPLOFY_MEMORY_SERVICE_TOKEN", "").strip()

try:
    import cognee  # type: ignore
    from cognee import SearchType  # type: ignore
    from cognee.infrastructure.engine import DataPoint, Embeddable  # type: ignore
    from cognee.infrastructure.engine.models.DataPoint import MetaData  # type: ignore
    from cognee.tasks.storage import add_data_points  # type: ignore

    COGNEE_AVAILABLE = True
except Exception:
    class _FallbackEmbeddable:
        pass

    cognee = None
    SearchType = None
    DataPoint = object
    Embeddable = _FallbackEmbeddable
    MetaData = dict
    add_data_points = None
    COGNEE_AVAILABLE = False


class Record(BaseModel):
    id: str
    type: str
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    sourceReferences: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, str]] = Field(default_factory=list)


class UpsertRequest(BaseModel):
    records: list[Record] = Field(default_factory=list, max_length=500)


class ReindexRequest(BaseModel):
    records: list[Record] = Field(default_factory=list, max_length=10_000)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=10_000)
    limit: int = Field(default=20, ge=1, le=100)


class ReplofyRecord(DataPoint):
    record_id: str
    workspace_id: str
    record_type: str
    content: Annotated[str, Embeddable()]
    source_references: list[dict[str, Any]] = Field(default_factory=list)
    metadata: MetaData = {
        "index_fields": ["content", "record_type"],
        "identity_fields": ["record_id"],
    }


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(STATE_DB)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS records (
            workspace_id TEXT NOT NULL,
            record_id TEXT NOT NULL,
            record_type TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            source_references_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (workspace_id, record_id)
        )
        """
    )
    connection.commit()
    return connection


def authorize(authorization: str | None) -> None:
    if not SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="Memory sidecar authorization is not configured.")
    if not authorization or not hmac.compare_digest(authorization, f"Bearer {SERVICE_TOKEN}"):
        raise HTTPException(status_code=401, detail="Memory sidecar authorization failed.")


def cognee_record_id(workspace_id: str, record_id: str) -> str:
    point = ReplofyRecord(
        record_id=f"{workspace_id}:{record_id}",
        workspace_id=workspace_id,
        record_type="replofy-record",
        content="",
    )
    return str(point.id)


async def delete_cognee_records(workspace_id: str, record_ids: list[str]) -> None:
    if not COGNEE_AVAILABLE or not record_ids:
        return

    ids = [cognee_record_id(workspace_id, record_id) for record_id in record_ids]
    try:
        from cognee.infrastructure.databases.graph.get_graph_engine import get_graph_engine  # type: ignore
        from cognee.infrastructure.databases.vector import get_vector_engine_async  # type: ignore

        graph_engine = await get_graph_engine()
        await graph_engine.delete_nodes(ids)
        vector_engine = await get_vector_engine_async()
        await vector_engine.delete_data_points("ReplofyRecord_content", ids)
    except Exception as error:
        raise HTTPException(status_code=503, detail="Memory index cleanup is unavailable.") from error


def row_to_record(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["record_id"],
        "type": row["record_type"],
        "content": row["content"],
        "metadata": json.loads(row["metadata_json"]),
        "sourceReferences": json.loads(row["source_references_json"]),
    }


def lexical_search(workspace_id: str, query: str, limit: int) -> list[dict[str, Any]]:
    terms = [term.lower() for term in query.split() if len(term) >= 3][:12]
    with closing(db()) as connection:
        rows = connection.execute(
            "SELECT * FROM records WHERE workspace_id = ? ORDER BY updated_at DESC",
            (workspace_id,),
        ).fetchall()
    ranked: list[tuple[int, sqlite3.Row]] = []
    for row in rows:
        text = f"{row['record_type']} {row['content']}".lower()
        score = sum(text.count(term) for term in terms)
        if score:
            ranked.append((score, row))
    ranked.sort(key=lambda item: (-item[0], item[1]["updated_at"]))
    return [row_to_record(row) | {"score": score} for score, row in ranked[:limit]]


app = FastAPI(title="Replofy Memory Sidecar", version="1.0.0")


@app.get("/health")
async def health() -> dict[str, Any]:
    with closing(db()) as connection:
        connection.execute("SELECT 1").fetchone()
    return {"ok": True, "storage": str(DATA_DIR), "cognee": COGNEE_AVAILABLE}


@app.post("/v1/workspaces/{workspace_id}/records:upsert")
async def upsert_records(workspace_id: str, request: UpsertRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    with closing(db()) as connection:
        for record in request.records:
            metadata = {**record.metadata, "workspaceId": workspace_id, "recordId": record.id}
            connection.execute(
                """
                INSERT INTO records (workspace_id, record_id, record_type, content, metadata_json, source_references_json)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(workspace_id, record_id) DO UPDATE SET
                    record_type = excluded.record_type,
                    content = excluded.content,
                    metadata_json = excluded.metadata_json,
                    source_references_json = excluded.source_references_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    workspace_id,
                    record.id,
                    record.type,
                    record.content,
                    json.dumps(metadata),
                    json.dumps(record.sourceReferences),
                ),
            )
            if COGNEE_AVAILABLE and add_data_points is not None:
                point = ReplofyRecord(
                    record_id=f"{workspace_id}:{record.id}",
                    workspace_id=workspace_id,
                    record_type=record.type,
                    content=f"[workspace:{workspace_id}] {record.content}",
                    source_references=record.sourceReferences,
                )
                await add_data_points([point])
        connection.commit()
    return {"ok": True, "count": len(request.records), "cognee": COGNEE_AVAILABLE}


@app.post("/v1/workspaces/{workspace_id}/search")
async def search_records(workspace_id: str, request: SearchRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    if COGNEE_AVAILABLE and cognee is not None and SearchType is not None:
        try:
            results = await cognee.search(
                request.query,
                query_type=SearchType.CHUNKS,
                top_k=request.limit * 3,
            )
            text_results = []
            for result in results:
                value = result if isinstance(result, str) else (
                    result.get("search_result") if isinstance(result, dict) else getattr(result, "search_result", None)
                )
                if value is None and isinstance(result, dict):
                    value = result.get("text") or result.get("content") or result.get("chunk")
                elif value is None and not isinstance(result, str):
                    value = getattr(result, "content", None)
                if isinstance(value, dict):
                    value = value.get("text") or value.get("content") or value.get("chunk")
                if not isinstance(value, str) or f"[workspace:{workspace_id}]" not in value:
                    continue
                content = value.split("] ", 1)[1] if "] " in value else value
                with closing(db()) as connection:
                    row = connection.execute(
                        "SELECT * FROM records WHERE workspace_id = ? AND content = ? LIMIT 1",
                        (workspace_id, content),
                    ).fetchone()
                if row:
                    text_results.append(row_to_record(row) | {"score": None})
                if len(text_results) >= request.limit:
                    break
            if text_results:
                return {"data": text_results, "engine": "cognee"}
        except Exception:
            pass
    return {"data": lexical_search(workspace_id, request.query, request.limit), "engine": "lexical-fallback"}


@app.delete("/v1/workspaces/{workspace_id}/sources/{source_version_id}")
async def delete_source(workspace_id: str, source_version_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    with closing(db()) as connection:
        rows = connection.execute("SELECT record_id, metadata_json FROM records WHERE workspace_id = ?", (workspace_id,)).fetchall()
    matching_ids = [
        row["record_id"]
        for row in rows
        if json.loads(row["metadata_json"]).get("sourceVersionId") == source_version_id
    ]
    await delete_cognee_records(workspace_id, matching_ids)
    with closing(db()) as connection:
        deleted = 0
        for record_id in matching_ids:
            deleted += connection.execute(
                "DELETE FROM records WHERE workspace_id = ? AND record_id = ?",
                (workspace_id, record_id),
            ).rowcount
        connection.commit()
    return {"ok": True, "deleted": deleted}


@app.delete("/v1/workspaces/{workspace_id}/records/{record_id}")
async def delete_record(workspace_id: str, record_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    with closing(db()) as connection:
        existing = connection.execute(
            "SELECT record_id FROM records WHERE workspace_id = ? AND record_id = ?",
            (workspace_id, record_id),
        ).fetchone()
    if existing:
        await delete_cognee_records(workspace_id, [record_id])
    with closing(db()) as connection:
        result = connection.execute(
            "DELETE FROM records WHERE workspace_id = ? AND record_id = ?",
            (workspace_id, record_id),
        )
        connection.commit()
    return {"ok": True, "deleted": result.rowcount > 0}


@app.post("/v1/workspaces/{workspace_id}/reindex")
async def reindex(workspace_id: str, request: ReindexRequest | None = None, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(authorization)
    records = request.records if request is not None else []
    with closing(db()) as connection:
        existing = connection.execute(
            "SELECT record_id FROM records WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchall()
    await delete_cognee_records(workspace_id, [row["record_id"] for row in existing])
    with closing(db()) as connection:
        connection.execute("DELETE FROM records WHERE workspace_id = ?", (workspace_id,))
        for record in records:
            metadata = {**record.metadata, "workspaceId": workspace_id, "recordId": record.id}
            connection.execute(
                """
                INSERT INTO records (workspace_id, record_id, record_type, content, metadata_json, source_references_json)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(workspace_id, record_id) DO UPDATE SET
                    record_type = excluded.record_type,
                    content = excluded.content,
                    metadata_json = excluded.metadata_json,
                    source_references_json = excluded.source_references_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    workspace_id,
                    record.id,
                    record.type,
                    record.content,
                    json.dumps(metadata),
                    json.dumps(record.sourceReferences),
                ),
            )
            if COGNEE_AVAILABLE and add_data_points is not None:
                point = ReplofyRecord(
                    record_id=f"{workspace_id}:{record.id}",
                    workspace_id=workspace_id,
                    record_type=record.type,
                    content=f"[workspace:{workspace_id}] {record.content}",
                    source_references=record.sourceReferences,
                )
                await add_data_points([point])
        connection.commit()
    return {"ok": True, "workspaceId": workspace_id, "records": len(records), "cognee": COGNEE_AVAILABLE}
