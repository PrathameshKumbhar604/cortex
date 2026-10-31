import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Connector, RawEvidence } from "@cortex/connectors";
import { db, dbReady } from "./db";

export const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT = 200_000; // characters kept for search per file
const root = process.env.CORTEX_ROOT ?? path.resolve(process.cwd(), "../..");
const uploads = path.join(root, ".data", "uploads");

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  /** False when no text could be read (images, unsupported formats): stored, but not searchable. */
  searchable: boolean;
}

const ready = dbReady.then(() =>
  db.exec(`CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
    size INTEGER NOT NULL, created_at TEXT NOT NULL, text TEXT NOT NULL DEFAULT ''
  ); CREATE INDEX IF NOT EXISTS files_user ON files(user_id);`),
);

const TEXTUAL = /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|log|ini|toml|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|sql|sh|ps1|css)$/i;

async function extractText(bytes: Uint8Array, type: string, name: string): Promise<string> {
  try {
    if (type === "application/pdf" || /\.pdf$/i.test(name)) {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      // A copy: the PDF reader takes over (and empties) the buffer it is given.
      const { text } = await pdfText(await getDocumentProxy(bytes.slice()), { mergePages: true });
      return text;
    }
    if (type.startsWith("text/") || type === "application/json" || TEXTUAL.test(name)) return new TextDecoder().decode(bytes);
  } catch {
    // unreadable or encrypted: keep the file, just not searchable
  }
  return "";
}

const row = (r: Record<string, unknown>): StoredFile => ({
  id: String(r.id),
  name: String(r.name),
  type: String(r.type),
  size: Number(r.size),
  createdAt: String(r.created_at),
  searchable: Number(r.text_len) > 0,
});
const COLUMNS = "id, name, type, size, created_at, length(text) AS text_len";

export async function saveFile(userId: string, file: File): Promise<StoredFile> {
  await ready;
  const id = randomUUID();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = path.basename(file.name).slice(0, 200) || "file";
  const type = file.type || "application/octet-stream";
  mkdirSync(path.join(uploads, safe(userId)), { recursive: true });
  await writeFile(path.join(uploads, safe(userId), id), bytes);
  const text = (await extractText(bytes, type, name)).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  db.prepare("INSERT INTO files (id, user_id, name, type, size, created_at, text) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    id, userId, name, type, file.size, new Date().toISOString(), text,
  );
  return row(db.prepare(`SELECT ${COLUMNS} FROM files WHERE id = ?`).get(id) as Record<string, unknown>);
}

export async function listFiles(userId: string): Promise<StoredFile[]> {
  await ready;
  return (db.prepare(`SELECT ${COLUMNS} FROM files WHERE user_id = ? ORDER BY created_at DESC`).all(userId) as Record<string, unknown>[]).map(row);
}

/** The file and its bytes, only for its owner. */
export async function readStoredFile(userId: string, id: string) {
  await ready;
  const r = db.prepare(`SELECT ${COLUMNS} FROM files WHERE id = ? AND user_id = ?`).get(id, userId) as Record<string, unknown> | undefined;
  if (!r) return null;
  return { file: row(r), bytes: await readFile(path.join(uploads, safe(userId), id)) };
}

export async function deleteFile(userId: string, id: string): Promise<boolean> {
  await ready;
  const res = db.prepare("DELETE FROM files WHERE id = ? AND user_id = ?").run(id, userId);
  if (!res.changes) return false;
  await rm(path.join(uploads, safe(userId), id), { force: true });
  return true;
}

const terms = (q: string) => [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];

/** The passages of a file's text most related to the query (the opening ones when nothing matches). */
function passages(text: string, words: string[], max: number): string[] {
  const chunks = text.match(/[\s\S]{1,700}(?:\s|$)/g) ?? [];
  const scored = chunks.map((c, i) => ({ c, i, s: words.filter((w) => c.toLowerCase().includes(w)).length }));
  const hits = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i);
  return (hits.length ? hits : scored).slice(0, max).map((x) => x.c.trim());
}

function evidenceFor(f: { id: string; name: string; created_at: string; text: string }, words: string[], max: number): RawEvidence[] {
  return passages(f.text, words, max).map((quote) => ({
    source: "files",
    title: f.name,
    quote,
    url: `/api/files/${f.id}`,
    timestamp: f.created_at,
    ref: f.id,
  }));
}

/** Attached to a question: the file's most relevant passages always go to the answer, searched or not. */
export async function attachmentEvidence(userId: string, ids: string[], question: string): Promise<RawEvidence[]> {
  await ready;
  const words = terms(question);
  return ids.slice(0, 5).flatMap((id) => {
    const f = db.prepare("SELECT id, name, created_at, text FROM files WHERE id = ? AND user_id = ?").get(id, userId) as
      | { id: string; name: string; created_at: string; text: string }
      | undefined;
    return f?.text ? evidenceFor(f, words, 3) : [];
  });
}

/** Uploaded files as a source like any connected app: searched, cited and listed on the Connections page. */
export const filesConnector: Connector = {
  id: "files",
  name: "Your files",
  kind: "upload",
  describes: "documents the user uploaded to Cortex (PDFs, notes, spreadsheets as CSV, code)",
  impact: "Answers won't include your uploaded files.",
  actions: [],
  async status(ctx) {
    await ready;
    const n = (db.prepare("SELECT COUNT(*) AS n FROM files WHERE user_id = ?").get(ctx.userId) as { n: number }).n;
    return { id: "files", name: "Your files", kind: "upload", connected: n > 0, available: true, canAct: false, detail: n ? undefined : "Upload a file to make it searchable." };
  },
  async search(input, ctx) {
    await ready;
    const words = terms(input.query);
    // shortcut: keyword match over at most 200 files per user; move to Oracle vectors when files grow.
    const rows = db.prepare("SELECT id, name, created_at, text FROM files WHERE user_id = ? AND text != '' ORDER BY created_at DESC LIMIT 200").all(ctx.userId) as {
      id: string;
      name: string;
      created_at: string;
      text: string;
    }[];
    // A file must match at least a third of the query's words: one shared filler word ("into", "note") isn't a match.
    const need = Math.max(1, Math.ceil(words.length / 3));
    const scored = rows
      .map((f) => ({ f, s: words.filter((w) => `${f.name} ${f.text}`.toLowerCase().includes(w)).length }))
      .filter((x) => !words.length || x.s >= need)
      .sort((a, b) => b.s - a.s);
    return scored.slice(0, input.limit ?? 4).flatMap(({ f }) => evidenceFor(f, words, 1));
  },
  async execute() {
    return { ok: false, message: "Uploaded files can't take actions." };
  },
};

/** Ids reach the filesystem: only the characters a UUID or user id uses. */
function safe(id: string) {
  return id.replace(/[^\w-]/g, "_");
}
