"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import type { MemoryItem, MemoryKind } from "@cortex/shared";
import { onSettings, readUseOtherChats, writeUseOtherChats } from "@/lib/settings";
import { cn, relativeDays } from "@/lib/ui";
import { explainError } from "@cortex/shared";
import { Problem } from "./problem";

const KIND_LABEL: Record<MemoryKind, string> = {
  priority: "Priorities",
  preference: "Preferences",
  decision: "Decisions",
  person: "People",
  fact: "Facts",
};
const SINGULAR: Record<MemoryKind, string> = { priority: "Priority", preference: "Preference", decision: "Decision", person: "Person", fact: "Fact" };
const ORDER: MemoryKind[] = ["priority", "preference", "decision", "person", "fact"];

export function MemoryView() {
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [backend, setBackend] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<MemoryKind>("priority");
  const [adding, setAdding] = useState(false);
  const otherChats = useSyncExternalStore(onSettings, readUseOtherChats, () => false);

  const load = useCallback(async () => {
    const res = await fetch("/api/memory");
    const body = await res.json();
    if (!res.ok) {
      setError(body.error);
      setItems([]);
      return;
    }
    setError(null);
    setBackend(body.backend);
    setItems(body.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (url: string, init: RequestInit) => {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
    if (!res.ok && res.status !== 204) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't work.");
    await load();
  };

  const add = async () => {
    if (draft.trim().length < 3) return;
    await mutate("/api/memory", { method: "POST", body: JSON.stringify({ content: draft, kind }) });
    setDraft("");
    setAdding(false);
  };

  const groups = ORDER.map((k) => ({ k, list: (items ?? []).filter((m) => m.kind === k) })).filter((g) => g.list.length);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 pt-10 pb-16 sm:px-6 md:pt-16">
        <h1 className="text-[32px] font-[300] leading-[1.15] tracking-[-0.035em] text-ink sm:text-[40px]">What Cortex remembers</h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted">
          As you chat, Cortex saves what will still matter next week: your priorities, preferences, people and decisions. Small talk, one-off questions
          and anything that looks like a password or code are never saved. Each memory shows why it was kept. Pinned memories never fade; everything
          else fades unless it comes up again.
        </p>

        <label className="mt-6 flex max-w-[60ch] cursor-pointer items-start gap-3 border-y border-line py-4">
          <input
            type="checkbox"
            role="switch"
            checked={otherChats}
            onChange={(e) => writeUseOtherChats(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors duration-200 peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-[260ms] after:ease-[var(--ease-spring)] peer-checked:after:translate-x-4"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-[550] text-ink">Use my other chats</span>
            <span className="text-[13.5px] leading-snug text-muted">
              Cortex can look back at your past chats when they help, and says which chat it used. Off unless you turn it on. Deleting a chat removes it
              for good.
            </span>
          </span>
        </label>

        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
            <Plus className="size-3.5" aria-hidden /> Add a memory yourself
          </button>
        )}

        {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="mt-8 flex flex-col gap-2 rounded-[12px] border border-line-strong p-2 focus-within:border-accent/60 sm:flex-row sm:items-center"
        >
          <label htmlFor="teach" className="sr-only">
            Teach Cortex something
          </label>
          <input
            id="teach"
            autoFocus
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder="Teach Cortex something…"
            className="no-ring min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[15px] text-ink outline-none placeholder:text-hair focus-visible:outline-none"
          />
          <div className="flex gap-2">
            <span className="relative">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MemoryKind)}
              aria-label="Kind"
              className="appearance-none rounded-[10px] border border-line bg-surface py-1.5 pr-8 pl-3 text-[13px] text-ink-2 hover:border-line-strong"
            >
              {ORDER.map((k) => (
                <option key={k} value={k}>
                  {SINGULAR[k]}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted" />
            </span>
            <button type="submit" disabled={draft.trim().length < 3} className="rounded-[10px] border border-ink bg-ink px-3 py-1.5 text-[13px] font-medium text-on-ink disabled:border-line-strong disabled:bg-transparent disabled:text-muted">
              Remember
            </button>
          </div>
        </form>
        )}

        {error && (
          <div className="mt-6">
            <Problem problem={explainError(error)} onRetry={() => void load()} variant="card" />
          </div>
        )}

        {items && items.length === 0 && !error && (
          <p className="mt-12 border-t border-line pt-6 text-[15px] text-muted">
            Nothing yet. Mention a priority or preference while you chat (“Orbit is my top priority this month”), or say “remember that…”.
          </p>
        )}

        {groups.map(({ k, list }) => (
          <section key={k} className="mt-10" aria-labelledby={`m-${k}`}>
            <h2 id={`m-${k}`} className="border-b border-ink pb-2 text-[15px] font-[600] text-ink">
              {KIND_LABEL[k]}
            </h2>
            <ul>
              {list.map((m) => (
                <MemoryRow
                  key={m.id}
                  m={m}
                  onPin={() => mutate(`/api/memory/${m.id}`, { method: "PATCH", body: JSON.stringify({ pinned: !m.pinned }) })}
                  onEdit={(content) => mutate(`/api/memory/${m.id}`, { method: "PATCH", body: JSON.stringify({ content }) })}
                  onForget={() => mutate(`/api/memory/${m.id}`, { method: "DELETE" })}
                />
              ))}
            </ul>
          </section>
        ))}
        {backend && (
          <p className="text-[12.5px] text-muted mt-12">
            Saved {backend === "oracle" ? "in the cloud, encrypted" : "on this device"}.
          </p>
        )}
      </div>
    </div>
  );
}

function MemoryRow({ m, onPin, onEdit, onForget }: { m: MemoryItem; onPin: () => void; onEdit: (c: string) => void; onForget: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="rise grid grid-cols-[1fr_auto] gap-4 border-b border-line py-4">
      <div className="min-w-0">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onEdit(text);
              setEditing(false);
            }}
            className="flex gap-2"
          >
            <input
              value={text}
              autoFocus
              onChange={(e) => setText(e.target.value)}
              aria-label="Edit memory"
              className="min-w-0 flex-1 rounded-md border border-line-strong px-2 py-1 text-[15px] text-ink focus:border-accent focus:outline-none"
            />
            <button type="submit" className="text-[13px] font-medium text-accent-ink">
              Save
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="text-left text-[15.5px] leading-snug text-ink hover:text-accent-ink" title="Edit">
            {m.content}
          </button>
        )}
        <p className="mt-1 text-[13px] leading-snug text-muted">
          {m.reason}
          {m.source && m.source !== "conversation" && m.source !== "you" ? ` · from ${m.source}` : ""}
        </p>
        <div className="readout mt-2 flex items-center gap-3 text-hair">
          <span>{relativeDays(m.createdAt)}</span>
          <span className="flex items-center gap-1.5" title="Salience: how strongly Cortex weighs this memory">
            <span aria-hidden className="h-[3px] w-14 overflow-hidden rounded-full bg-line">
              <span className="block h-full bg-accent" style={{ width: `${Math.round(m.salience * 100)}%` }} />
            </span>
            {Math.round(m.salience * 100)}
          </span>
          {m.expiresAt && !m.pinned && <span>fades {relativeDays(m.expiresAt)}</span>}
          {m.pinned && <span className="text-accent-ink">pinned</span>}
        </div>
      </div>
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={onPin}
          aria-label={m.pinned ? "Unpin" : "Pin"}
          title={m.pinned ? "Unpin" : "Pin: always use this memory"}
          className={cn("rounded-md p-1.5 hover:bg-shell", m.pinned ? "text-accent" : "text-muted hover:text-ink")}
        >
          {m.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </button>
        {confirm ? (
          <button type="button" onClick={onForget} className="rounded-md bg-risk-soft px-2 py-1 text-[12.5px] font-medium text-risk">
            Forget
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            onBlur={() => setConfirm(false)}
            aria-label="Forget"
            title="Forget this memory"
            className="rounded-md p-1.5 text-muted hover:bg-shell hover:text-risk"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </li>
  );
}
