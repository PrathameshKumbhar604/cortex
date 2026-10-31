import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { jsonError, session, unauthorized, withinLimit } from "@/server/cortex";
import { plainText } from "@/lib/snippet";

// Search chats by meaning: each turn (question + start of the answer) is embedded with Gemini's free embedding model
// and kept here; a chat is re-embedded when its text changes. Only the signed-in account's chats are searched.
db.exec(`
  CREATE TABLE IF NOT EXISTS chats (user_id TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, id));
  CREATE TABLE IF NOT EXISTS chat_vectors (user_id TEXT NOT NULL, id TEXT NOT NULL, hash TEXT NOT NULL, vecs BLOB NOT NULL, PRIMARY KEY (user_id, id));
`);
const MODEL = "gemini-embedding-001";
const DIMS = 768;
// shortcut: per-process cache of query vectors, fine for one server.
const queries = new Map<string, Float32Array>();

async function embed(texts: string[], task: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        requests: texts.slice(i, i + 100).map((text) => ({ model: `models/${MODEL}`, content: { parts: [{ text }] }, taskType: task, outputDimensionality: DIMS })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`embedding ${res.status}`);
    for (const e of ((await res.json()) as { embeddings: { values: number[] }[] }).embeddings) out.push(Float32Array.from(e.values));
  }
  return out;
}

function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    x += a[i]! * a[i]!;
    y += b[i]! * b[i]!;
  }
  return dot / Math.sqrt(x * y || 1);
}

const turnText = (title: string, t: { question?: unknown; answer?: unknown }) =>
  `${title}\n${String(t.question ?? "")}\n${plainText(String(t.answer ?? "")).slice(0, 1200)}`.slice(0, 2000);

/** POST { q, ids? } → { matches: [{ id, turn, score }] }; ids limits the search to the chats this browser has. */
export async function POST(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  if (!process.env.GEMINI_API_KEY) return Response.json({ matches: [], available: false });
  if (!withinLimit(`chat-search:${sess.authId}`, 60)) return jsonError("Searching too fast. Try again in a moment.", 429);
  const body = (await req.json().catch(() => ({}))) as { q?: unknown; ids?: unknown };
  const q = typeof body.q === "string" ? body.q.trim().slice(0, 300) : "";
  if (q.length < 3) return Response.json({ matches: [], available: true });
  const only = Array.isArray(body.ids) ? new Set(body.ids.filter((x): x is string => typeof x === "string")) : null;

  const user = sess.authId;
  // A deleted chat's vectors go with it.
  db.prepare("DELETE FROM chat_vectors WHERE user_id = ? AND id NOT IN (SELECT id FROM chats WHERE user_id = ?)").run(user, user);
  const rows = (db.prepare("SELECT id, json FROM chats WHERE user_id = ?").all(user) as { id: string; json: string }[]).filter((r) => !only || only.has(r.id));
  const stored = new Map((db.prepare("SELECT id, hash, vecs FROM chat_vectors WHERE user_id = ?").all(user) as { id: string; hash: string; vecs: Uint8Array }[]).map((r) => [r.id, r]));
  try {
    const chats = rows.map((r) => {
      const c = JSON.parse(r.json) as { title?: string; turns?: { question?: unknown; answer?: unknown }[] };
      const texts = (c.turns ?? []).map((t) => turnText(String(c.title ?? ""), t));
      const hash = createHash("sha1").update(JSON.stringify(texts)).digest("hex");
      const old = stored.get(r.id);
      const vecs = old?.hash === hash ? split(old.vecs) : null;
      return { id: r.id, texts, hash, vecs };
    });
    const stale = chats.filter((c) => !c.vecs && c.texts.length);
    if (stale.length) {
      const fresh = await embed(stale.flatMap((c) => c.texts), "RETRIEVAL_DOCUMENT");
      const save = db.prepare("INSERT OR REPLACE INTO chat_vectors (user_id, id, hash, vecs) VALUES (?, ?, ?, ?)");
      for (const c of stale) {
        c.vecs = fresh.splice(0, c.texts.length);
        save.run(user, c.id, c.hash, join(c.vecs));
      }
    }
    let qv = queries.get(q);
    if (!qv) {
      [qv] = await embed([q], "RETRIEVAL_QUERY");
      queries.set(q, qv!);
      if (queries.size > 500) queries.delete(queries.keys().next().value!);
    }
    const matches = chats.flatMap((c) => (c.vecs ?? []).map((v, turn) => ({ id: c.id, turn, score: Math.round(cosine(qv!, v) * 1000) / 1000 })));
    matches.sort((a, b) => b.score - a.score);
    return Response.json({ matches: matches.slice(0, 20), available: true });
  } catch {
    return Response.json({ matches: [], available: false }); // the model is busy or the key is wrong: keyword search still works
  }
}

const join = (vecs: Float32Array[]) => {
  const all = new Float32Array(vecs.length * DIMS);
  vecs.forEach((v, i) => all.set(v, i * DIMS));
  return new Uint8Array(all.buffer);
};
const split = (blob: Uint8Array) => {
  const all = new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength));
  return Array.from({ length: all.length / DIMS }, (_, i) => all.subarray(i * DIMS, (i + 1) * DIMS));
};
