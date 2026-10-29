"""SQLite ledger: provenance, pins and decay for every memory.

Oracle Agent Memory stores and searches the memory text; the ledger keeps the
governance fields Cortex shows in the Memory Inspector. Without Oracle, the
ledger's FTS index is the search backend too.
"""

from __future__ import annotations

import math
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

DB_PATH = os.environ.get("MEMORY_LEDGER_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "ledger.db"))

# How long each kind of memory lives unless pinned (None = until forgotten).
TTL_DAYS = {"priority": 45, "decision": 120, "fact": 90, "person": None, "preference": None}
HALF_LIFE_DAYS = 30.0
# Unpinned memories kept per user; beyond this the least salient go first.
MAX_PER_USER = 200
# Words too common to link one chat to another.
STOPWORDS = {
    "the", "and", "for", "you", "your", "are", "was", "were", "what", "when", "where", "which", "who", "why", "how",
    "did", "does", "this", "that", "with", "from", "about", "have", "has", "had", "can", "could", "would", "should",
    "will", "there", "their", "them", "they", "any", "all", "out", "get", "got", "tell", "said", "say", "last", "time",
    "chat", "chats", "talk", "talked", "discuss", "discussed", "earlier", "before", "remember", "other", "our", "not",
    "previous", "past", "conversation", "conversations", "ask", "asked", "yesterday", "week", "ago", "were", "been",
}


def now() -> datetime:
    return datetime.now(timezone.utc)


class Ledger:
    def __init__(self, path: str = DB_PATH) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS memories (
                  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL,
                  kind TEXT NOT NULL, source TEXT NOT NULL, reason TEXT NOT NULL,
                  salience REAL NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL, expires_at TEXT, run_id TEXT
                );
                CREATE INDEX IF NOT EXISTS memories_user ON memories(user_id);
                CREATE TABLE IF NOT EXISTS messages (
                  thread_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
                  content TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id);
                """
            )
            try:
                self._db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(id UNINDEXED, content)")
                self.fts = True
            except sqlite3.OperationalError:
                self.fts = False
            self._db.commit()

    # ---- rows -------------------------------------------------------------
    @staticmethod
    def to_item(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "userId": row["user_id"],
            "content": row["content"],
            "kind": row["kind"],
            "source": row["source"],
            "reason": row["reason"],
            "salience": round(Ledger.effective_salience(row), 3),
            "pinned": bool(row["pinned"]),
            "createdAt": row["created_at"],
            "expiresAt": row["expires_at"],
            "runId": row["run_id"],
        }

    @staticmethod
    def effective_salience(row: sqlite3.Row) -> float:
        if row["pinned"]:
            return float(row["salience"])
        age = (now() - datetime.fromisoformat(row["created_at"])).total_seconds() / 86400
        return float(row["salience"]) * math.pow(0.5, age / HALF_LIFE_DAYS)

    def _live(self, user_id: str) -> list[sqlite3.Row]:
        ts = now().isoformat()
        with self._lock:
            return self._db.execute(
                "SELECT * FROM memories WHERE user_id = ? AND (pinned = 1 OR expires_at IS NULL OR expires_at > ?)",
                (user_id, ts),
            ).fetchall()

    def get(self, memory_id: str) -> sqlite3.Row | None:
        with self._lock:
            return self._db.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()

    def list(self, user_id: str) -> list[dict]:
        rows = self._live(user_id)
        rows.sort(key=lambda r: (not r["pinned"], -self.effective_salience(r)))
        return [self.to_item(r) for r in rows]

    def find_duplicate(self, user_id: str, content: str) -> sqlite3.Row | None:
        norm = content.lower().strip()
        for r in self._live(user_id):
            if SequenceMatcher(None, norm, r["content"].lower()).ratio() > 0.82:
                return r
        return None

    def add(self, user_id: str, content: str, kind: str, source: str, reason: str, salience: float, run_id: str | None, expires_at: str | None) -> dict:
        ttl = TTL_DAYS.get(kind)
        if expires_at is None and ttl is not None:
            expires_at = (now() + timedelta(days=ttl)).isoformat()
        memory_id = str(uuid.uuid4())
        with self._lock:
            self._db.execute(
                "INSERT INTO memories VALUES (?,?,?,?,?,?,?,0,?,?,?)",
                (memory_id, user_id, content, kind, source, reason, salience, now().isoformat(), expires_at, run_id),
            )
            if self.fts:
                self._db.execute("INSERT INTO memories_fts VALUES (?, ?)", (memory_id, content))
            self._db.commit()
        return self.to_item(self.get(memory_id))  # type: ignore[arg-type]

    def trim(self, user_id: str, keep: int = MAX_PER_USER) -> list[str]:
        """Drops expired memories and the least salient unpinned ones beyond `keep`; returns removed ids."""
        ts = now().isoformat()
        with self._lock:
            rows = self._db.execute("SELECT * FROM memories WHERE user_id = ? AND pinned = 0", (user_id,)).fetchall()
        expired = {r["id"] for r in rows if r["expires_at"] and r["expires_at"] <= ts}
        live = sorted((r for r in rows if r["id"] not in expired), key=lambda r: -self.effective_salience(r))
        gone = [*expired, *(r["id"] for r in live[keep:])]
        for memory_id in gone:
            self.delete(memory_id)
        return gone

    def reinforce(self, row: sqlite3.Row, salience: float) -> dict:
        """A repeated memory is a signal: refresh its age and keep the higher salience."""
        with self._lock:
            self._db.execute(
                "UPDATE memories SET salience = ?, created_at = ? WHERE id = ?",
                (max(float(row["salience"]), salience), now().isoformat(), row["id"]),
            )
            self._db.commit()
        return self.to_item(self.get(row["id"]))  # type: ignore[arg-type]

    def update(self, memory_id: str, content: str | None, pinned: bool | None) -> dict | None:
        with self._lock:
            if content is not None:
                self._db.execute("UPDATE memories SET content = ?, reason = reason || ' · edited by you' WHERE id = ?", (content, memory_id))
                if self.fts:
                    self._db.execute("UPDATE memories_fts SET content = ? WHERE id = ?", (content, memory_id))
            if pinned is not None:
                self._db.execute("UPDATE memories SET pinned = ? WHERE id = ?", (1 if pinned else 0, memory_id))
            self._db.commit()
        row = self.get(memory_id)
        return self.to_item(row) if row else None

    def delete(self, memory_id: str) -> bool:
        with self._lock:
            cur = self._db.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
            if self.fts:
                self._db.execute("DELETE FROM memories_fts WHERE id = ?", (memory_id,))
            self._db.commit()
            return cur.rowcount > 0

    def keyword_search(self, user_id: str, query: str, limit: int) -> list[tuple[str, float]]:
        """Fallback search: FTS5 BM25 when available, token overlap otherwise."""
        live = {r["id"]: r for r in self._live(user_id)}
        terms = [t for t in "".join(c if c.isalnum() else " " for c in query.lower()).split() if len(t) > 2]
        if not terms or not live:
            return []
        if self.fts:
            match = " OR ".join(f'"{t}"*' for t in terms)
            with self._lock:
                rows = self._db.execute(
                    "SELECT id, bm25(memories_fts) AS s FROM memories_fts WHERE memories_fts MATCH ? ORDER BY s LIMIT ?",
                    (match, limit * 3),
                ).fetchall()
            return [(r["id"], 1.0 / (1.0 + max(0.0, r["s"] + 10))) for r in rows if r["id"] in live][:limit]
        scored = []
        for r in live.values():
            words = set(r["content"].lower().split())
            hits = sum(1 for t in terms if any(w.startswith(t) for w in words))
            if hits:
                scored.append((r["id"], hits / len(terms)))
        return sorted(scored, key=lambda x: -x[1])[:limit]

    def pinned(self, user_id: str, limit: int = 3) -> list[dict]:
        return [m for m in self.list(user_id) if m["pinned"]][:limit]

    # ---- short-term thread fallback ---------------------------------------
    def append_messages(self, thread_id: str, user_id: str, messages: list[dict]) -> None:
        with self._lock:
            self._db.executemany(
                "INSERT INTO messages VALUES (?,?,?,?,?)",
                [(thread_id, user_id, m["role"], m["content"][:4000], now().isoformat()) for m in messages],
            )
            self._db.commit()

    def search_chats(self, user_id: str, query: str, exclude_thread: str | None, limit: int = 3, recent: bool = False) -> list[dict]:
        """Past question/answer pairs of this user's other chats that share words with the query.
        With `recent` (the user asked about their past chats without naming a topic), their latest chats instead."""
        terms = {t for t in "".join(c if c.isalnum() else " " for c in query.lower()).split() if len(t) > 2} - STOPWORDS
        if not terms:
            return self.recent_chats(user_id, exclude_thread, 5) if recent else []
        # shortcut: keyword overlap over the newest 2,000 turns; move to Oracle vectors once chats are stored server-side (#7).
        with self._lock:
            rows = self._db.execute(
                """SELECT q.thread_id, q.content AS question, a.content AS answer, q.created_at
                   FROM messages q JOIN messages a ON a.rowid = q.rowid + 1 AND a.thread_id = q.thread_id AND a.role = 'assistant'
                   WHERE q.user_id = ? AND q.role = 'user' AND q.thread_id != ?
                   ORDER BY q.rowid DESC LIMIT 2000""",
                (user_id, exclude_thread or ""),
            ).fetchall()
        need = max(1, math.ceil(len(terms) / 3))  # one shared word is noise in a long question
        scored = []
        for r in rows:
            words = set("".join(c if c.isalnum() else " " for c in f"{r['question']} {r['answer']}".lower()).split())
            hits = sum(1 for t in terms if t in words)
            if hits >= need:
                scored.append((hits, r))
        scored.sort(key=lambda x: -x[0])  # stable: newest first among equals
        return [
            {"thread_id": r["thread_id"], "question": r["question"][:300], "answer": r["answer"][:600], "created_at": r["created_at"]}
            for _, r in scored[:limit]
        ]

    def recent_chats(self, user_id: str, exclude_thread: str | None, limit: int) -> list[dict]:
        """How each of the latest chats began: the opening question and answer, newest chat first."""
        with self._lock:
            rows = self._db.execute(
                """SELECT q.thread_id, q.content AS question, a.content AS answer, t.last AS created_at
                   FROM (SELECT thread_id, MIN(rowid) AS first, MAX(created_at) AS last FROM messages
                         WHERE user_id = ? AND thread_id != ? GROUP BY thread_id ORDER BY last DESC LIMIT ?) t
                   JOIN messages q ON q.rowid = t.first
                   LEFT JOIN messages a ON a.rowid = t.first + 1 AND a.thread_id = t.thread_id
                   ORDER BY t.last DESC""",
                (user_id, exclude_thread or "", limit),
            ).fetchall()
        return [
            {"thread_id": r["thread_id"], "question": r["question"][:300], "answer": (r["answer"] or "")[:300], "created_at": r["created_at"]}
            for r in rows
        ]

    def delete_thread(self, thread_id: str, user_id: str) -> None:
        with self._lock:
            self._db.execute("DELETE FROM messages WHERE thread_id = ? AND user_id = ?", (thread_id, user_id))
            self._db.commit()

    def recent_messages(self, thread_id: str, limit: int = 6) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT role, content FROM messages WHERE thread_id = ? ORDER BY rowid DESC LIMIT ?", (thread_id, limit)
            ).fetchall()
        return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
