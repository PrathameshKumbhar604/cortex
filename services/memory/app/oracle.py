"""Oracle Agent Memory adapter. Imported only when Oracle is configured."""

from __future__ import annotations

import logging
import os

log = logging.getLogger("cortex.memory.oracle")


class OracleStore:
    """Semantic storage + search on Oracle AI Database via Oracle Agent Memory.

    Cortex decides what is worth remembering, so automatic extraction is off;
    threads keep the conversation for Oracle's context summaries.
    """

    def __init__(self) -> None:
        import oracledb
        from oracleagentmemory.core import MemoryExtractionConfig, SchemaPolicy
        from oracleagentmemory.core.embedders.embedder import Embedder
        from oracleagentmemory.core.llms.llm import Llm
        from oracleagentmemory.core.oracleagentmemory import OracleAgentMemory

        gemini_key = os.environ.get("GEMINI_API_KEY")
        embedder = Embedder(
            model=os.environ.get("MEMORY_EMBED_MODEL", "gemini/gemini-embedding-001"),
            api_key=gemini_key,
        )
        llm = Llm(model=os.environ.get("MEMORY_LLM_MODEL", "gemini/gemini-flash-lite-latest"), api_key=gemini_key)

        wallet = os.environ.get("ORACLE_WALLET_DIR")
        pool_args = dict(
            user=os.environ["ORACLE_DB_USER"],
            password=os.environ["ORACLE_DB_PASSWORD"],
            dsn=os.environ["ORACLE_DB_DSN"],
            min=1,
            max=4,
        )
        if wallet and os.path.isdir(wallet):
            pool_args.update(config_dir=wallet, wallet_location=wallet, wallet_password=os.environ.get("ORACLE_WALLET_PASSWORD"))
        self._pool = oracledb.create_pool(**pool_args)

        self._client = OracleAgentMemory(
            connection=self._pool,
            embedder=embedder,
            llm=llm,
            schema_policy=SchemaPolicy.CREATE_IF_NECESSARY,
            memory_store_id=os.environ.get("MEMORY_STORE_ID", "CORTEX"),
            memory_extraction_config=MemoryExtractionConfig(extract_memories=False),
        )
        self._threads: dict[str, object] = {}

    # long-term -------------------------------------------------------------
    def add(self, memory_id: str, user_id: str, content: str, kind: str, ttl_days: int | None) -> None:
        memory_type = "preference" if kind == "preference" else "fact" if kind in ("fact", "person") else "memory"
        kwargs = {"ttl_days": ttl_days} if ttl_days else {}
        self._client.add_memory(
            content,
            memory_type=memory_type,
            user_id=user_id,
            memory_id=memory_id,
            metadata={"kind": kind, "app": "cortex"},
            **kwargs,
        )

    def update(self, memory_id: str, content: str) -> None:
        self._client.update_memory(memory_id, content=content)

    def delete(self, memory_id: str) -> None:
        self._client.delete_memory(memory_id)

    def search(self, user_id: str, query: str, limit: int) -> list[tuple[str, float]]:
        results = self._client.search(query, user_id=user_id, max_results=limit, record_types=["memory", "fact", "preference"])
        out: list[tuple[str, float]] = []
        for rank, r in enumerate(results):
            record = getattr(r, "record", r)
            mid = getattr(record, "memory_id", None) or getattr(record, "id", None) or getattr(r, "id", None)
            score = getattr(r, "score", None)
            if mid:
                out.append((str(mid), float(score) if isinstance(score, (int, float)) else 1.0 / (rank + 1)))
        return out

    # short-term ------------------------------------------------------------
    def _thread(self, thread_id: str, user_id: str):
        t = self._threads.get(thread_id)
        if t is None:
            try:
                t = self._client.get_thread(thread_id)
            except KeyError:
                t = self._client.create_thread(thread_id=thread_id, user_id=user_id, agent_id="cortex")
            self._threads[thread_id] = t
        return t

    def append_messages(self, thread_id: str, user_id: str, messages: list[dict]) -> None:
        self._thread(thread_id, user_id).add_messages(messages)

    def context(self, thread_id: str, user_id: str) -> str:
        t = self._thread(thread_id, user_id)
        try:
            return t.get_summary().content or ""
        except Exception:  # summaries need an LLM; degrade quietly
            log.info("summary unavailable for %s", thread_id)
            return ""
