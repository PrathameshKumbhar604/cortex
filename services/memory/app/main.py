"""Cortex memory service.

Long-term memory with provenance, pinning and decay; short-term thread memory.
Uses Oracle Agent Memory on Oracle AI Database when configured, otherwise a
local SQLite store, and /health says which one is active.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

from .ledger import TTL_DAYS, Ledger

# shortcut: measured 2026-10-29: rewordings 0.15-0.26, unrelated from 0.34, so only near-identical wording merges here;
# looser paraphrases are caught by the extraction model, which sees related memories. Re-tune with more data.
DUPLICATE_DISTANCE = 0.15

load_dotenv(Path(__file__).resolve().parents[3] / ".env")
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("cortex.memory")

ledger = Ledger()
oracle = None
oracle_error: str | None = None
if os.environ.get("ORACLE_DB_DSN"):
    try:
        from .oracle import OracleStore

        oracle = OracleStore()
        log.info("Oracle Agent Memory connected")
    except Exception as exc:  # keep serving from the ledger
        oracle_error = f"{type(exc).__name__}: {exc}"[:240]
        log.warning("Oracle unavailable, using SQLite fallback: %s", oracle_error)

app = FastAPI(title="Cortex Memory", version="0.1.0")


class MemoryIn(BaseModel):
    user_id: str
    content: str = Field(min_length=3, max_length=500)
    kind: str = "fact"
    source: str = "conversation"
    reason: str = "Mentioned in conversation"
    salience: float = Field(default=0.6, ge=0, le=1)
    run_id: str | None = None
    expires_at: str | None = None
    replaces: str | None = None  # id of a memory this one updates ("moved to Nov 14" replaces "is on Nov 12")


class SearchIn(BaseModel):
    user_id: str
    query: str
    limit: int = Field(default=5, ge=1, le=20)


class PatchIn(BaseModel):
    content: str | None = Field(default=None, min_length=3, max_length=500)
    pinned: bool | None = None


class Turn(BaseModel):
    role: str
    content: str


class MessagesIn(BaseModel):
    user_id: str
    messages: list[Turn]


@app.get("/health")
def health():
    return {"ok": True, "backend": "oracle" if oracle else "sqlite", "detail": oracle_error}


@app.get("/memories")
def list_memories(user_id: str):
    return ledger.list(user_id)


@app.post("/memories")
def add_memory(m: MemoryIn):
    # An update looks like what it replaces, so it skips the duplicate check.
    dup = None if m.replaces else ledger.find_duplicate(m.user_id, m.content)
    if dup is None and oracle and not m.replaces:
        # Same meaning in other words ("Prefers short answers" / "Likes brief replies") reinforces too.
        try:
            near = oracle.search(m.user_id, m.content, 1, max_distance=DUPLICATE_DISTANCE)
            dup = ledger.get(near[0][0]) if near else None
        except Exception as exc:
            log.warning("oracle duplicate check failed: %s", exc)
    if dup is not None:
        return ledger.reinforce(dup, m.salience)
    item = ledger.add(m.user_id, m.content.strip(), m.kind, m.source, m.reason, m.salience, m.run_id, m.expires_at)
    if oracle:
        try:
            oracle.add(item["id"], m.user_id, item["content"], m.kind, TTL_DAYS.get(m.kind))
        except Exception as exc:
            log.warning("oracle add failed: %s", exc)
    old = ledger.get(m.replaces) if m.replaces else None
    replaced = [old["id"]] if old is not None and old["user_id"] == m.user_id and not old["pinned"] else []
    for gone in replaced:
        ledger.delete(gone)
    for gone in replaced + ledger.trim(m.user_id):
        if oracle:
            try:
                oracle.delete(gone)
            except Exception as exc:
                log.warning("oracle delete failed: %s", exc)
    return item


@app.post("/search")
def search(q: SearchIn):
    hits: list[tuple[str, float]] | None = None
    if oracle:
        try:
            hits = oracle.search(q.user_id, q.query, q.limit * 2)
        except Exception as exc:
            log.warning("oracle search failed, using keyword search: %s", exc)
    if hits is None:  # no Oracle, or it failed; an empty Oracle result means "nothing relevant"
        hits = ledger.keyword_search(q.user_id, q.query, q.limit * 2)

    results: dict[str, dict] = {m["id"]: m for m in ledger.pinned(q.user_id)}
    scored = []
    for mid, rel in hits:
        row = ledger.get(mid)
        if row is None or mid in results:
            continue
        item = ledger.to_item(row)
        scored.append((rel * (0.5 + 0.5 * item["salience"]), item))
    for _, item in sorted(scored, key=lambda x: -x[0])[: max(0, q.limit - len(results))]:
        results[item["id"]] = item
    return list(results.values())


@app.patch("/memories/{memory_id}")
def patch_memory(memory_id: str, p: PatchIn):
    item = ledger.update(memory_id, p.content, p.pinned)
    if item is None:
        raise HTTPException(404, "memory not found")
    if oracle and p.content is not None:
        try:
            oracle.update(memory_id, p.content)
        except Exception as exc:
            log.warning("oracle update failed: %s", exc)
    return item


@app.delete("/memories/{memory_id}", status_code=204)
def delete_memory(memory_id: str):
    if not ledger.delete(memory_id):
        raise HTTPException(404, "memory not found")
    if oracle:
        try:
            oracle.delete(memory_id)
        except Exception as exc:
            log.warning("oracle delete failed: %s", exc)
    return Response(status_code=204)


@app.post("/threads/{thread_id}/messages", status_code=204)
def append_messages(thread_id: str, body: MessagesIn):
    msgs = [t.model_dump() for t in body.messages]
    ledger.append_messages(thread_id, body.user_id, msgs)
    if oracle:
        try:
            oracle.append_messages(thread_id, body.user_id, msgs)
        except Exception as exc:
            log.warning("oracle thread append failed: %s", exc)
    return Response(status_code=204)


class ChatSearchIn(BaseModel):
    user_id: str
    query: str
    exclude_thread: str | None = None
    limit: int = Field(default=3, ge=1, le=10)
    recent: bool = False  # no topic named: return the latest chats


@app.post("/threads/search")
def search_chats(body: ChatSearchIn):
    return ledger.search_chats(body.user_id, body.query, body.exclude_thread, body.limit, body.recent)


@app.delete("/threads/{thread_id}", status_code=204)
def delete_thread(thread_id: str, user_id: str):
    ledger.delete_thread(thread_id, user_id)
    return Response(status_code=204)


@app.get("/threads/{thread_id}/context")
def thread_context(thread_id: str, user_id: str):
    summary = ""
    if oracle:
        try:
            summary = oracle.context(thread_id, user_id)
        except Exception as exc:
            log.warning("oracle context failed: %s", exc)
    return {"summary": summary, "recent": ledger.recent_messages(thread_id)}
