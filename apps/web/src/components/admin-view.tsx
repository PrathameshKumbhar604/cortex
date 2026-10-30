"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Loader2, Search } from "lucide-react";
import { explainError } from "@cortex/shared";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/ui";
import { Problem } from "./problem";
import { SourceMark } from "./ask/sources";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  disabled: boolean;
  verified: boolean;
  createdAt: string;
  lastActive: string | null;
  today: { questions: number };
  total: { questions: number; llmCalls: number; searches: number; actions: number };
  files: number;
  memories: number | null;
}
interface Overview {
  me: string;
  users: AdminUser[];
  settings: { dailyQuestionLimit: number | null; allowedConnectors: string[] | null };
  activity: { at: string; actor: string; kind: string; target: string; detail: string }[];
  connectors: { id: string; name: string; connected: boolean; available: boolean; detail?: string }[];
  memory: { ok: boolean; backend: string };
  composio: "project" | "personal" | "none";
}

const KIND: Record<string, { label: string; tone: string }> = {
  "admin.role": { label: "Role changed", tone: "text-accent-ink" },
  "admin.disable": { label: "Account turned off", tone: "text-risk" },
  "admin.enable": { label: "Account turned on", tone: "text-ok" },
  "admin.settings": { label: "Settings changed", tone: "text-accent-ink" },
  "action.executed": { label: "Action done", tone: "text-ok" },
  "action.failed": { label: "Action failed", tone: "text-warn" },
  error: { label: "Error shown", tone: "text-warn" },
};
const FILTERS = [
  { id: "all", label: "All" },
  { id: "admin", label: "Admin changes" },
  { id: "action", label: "Actions" },
  { id: "error", label: "Errors" },
] as const;

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 60 / 24)} d ago`;
};

export function AdminView() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Couldn't load the admin panel.");
    setError(null);
    setData(body as Overview);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const change = async (user: AdminUser, patch: { role?: "admin" | "member"; disabled?: boolean }) => {
    setPending(user.id);
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    setPending(null);
    if (!res.ok) {
      toast("That change didn't go through", { body: ((await res.json().catch(() => ({}))) as { error?: string }).error, tone: "warn" });
      return;
    }
    toast(patch.disabled === true ? `${user.email} is turned off` : patch.disabled === false ? `${user.email} is turned on` : `${user.email} is now ${patch.role === "admin" ? "an admin" : "a member"}`);
    await load();
  };

  const saveSettings = async (settings: Overview["settings"]) => {
    const res = await fetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
    if (!res.ok) {
      toast("Settings weren't saved", { body: ((await res.json().catch(() => ({}))) as { error?: string }).error, tone: "warn" });
      return;
    }
    toast("Settings saved");
    await load();
  };

  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.users ?? []).filter((u) => !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
  }, [data, query]);
  const activity = (data?.activity ?? []).filter((a) => filter === "all" || a.kind.startsWith(filter));
  const emailOf = (id: string) => data?.users.find((u) => u.id === id)?.email ?? id;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1080px] px-4 pt-10 pb-16 sm:px-6 md:pt-16">
        <h1 className="text-[32px] font-[400] leading-[1.15] tracking-[-0.015em] text-ink sm:text-[40px]">Admin</h1>
        <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-muted">
          Everyone who uses this Cortex, what they use, and the settings that apply to all of them. Turning an account off signs it out everywhere.
        </p>

        {error && (
          <div className="mt-8">
            <Problem problem={explainError(error)} onRetry={() => void load()} variant="card" />
          </div>
        )}
        {!data && !error && <Loader2 className="mt-10 size-5 animate-spin text-hair" aria-label="Loading" />}

        {data && (
          <>
            <dl className="rise mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-4">
              {[
                ["Accounts", data.users.length],
                ["Active today", data.users.filter((u) => u.today.questions > 0).length],
                ["Questions today", data.users.reduce((n, u) => n + u.today.questions, 0)],
                ["Actions done", data.users.reduce((n, u) => n + u.total.actions, 0)],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface px-4 py-3.5">
                  <dt className="text-[12.5px] text-muted">{label}</dt>
                  <dd className="tabular mt-1 text-[24px] font-[350] tracking-[-0.02em] text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <section className="mt-12" aria-labelledby="h-accounts">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink pb-2">
                <h2 id="h-accounts" className="text-[15px] font-[600] text-ink">
                  Accounts
                </h2>
                <label className="flex items-center gap-2 rounded-[8px] border border-line px-2.5 py-1 focus-within:border-accent/60">
                  <Search className="size-3.5 text-hair" aria-hidden />
                  <span className="sr-only">Search accounts</span>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" className="no-ring w-48 bg-transparent text-[13px] text-ink outline-none placeholder:text-hair" />
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left text-[13.5px]">
                  <thead className="text-[12px] text-muted">
                    <tr className="border-b border-line">
                      {["Account", "Role", "Status", "Today", "Questions", "Model calls", "Searches", "Actions", "Memories", "Files", "Last active"].map((h, i) => (
                        <th key={h} className={cn("px-2 py-2 font-[500]", i > 2 && "text-right")}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const me = u.id === data.me;
                      const busy = pending === u.id;
                      return (
                        <tr key={u.id} className={cn("border-b border-line align-middle", u.disabled && "text-hair")}>
                          <td className="max-w-[260px] px-2 py-2.5">
                            <p className="flex items-center gap-1.5 truncate font-[550] text-ink">
                              <span className="truncate">{u.name || u.email.split("@")[0]}</span>
                              {u.verified && <BadgeCheck className="size-3.5 shrink-0 text-accent" aria-label="Email confirmed" />}
                              {me && <span className="text-[11.5px] font-[400] text-muted">(you)</span>}
                            </p>
                            <p className="truncate text-[12.5px] text-muted">{u.email}</p>
                          </td>
                          <td className="px-2 py-2.5">
                            <select
                              aria-label={`Role for ${u.email}`}
                              value={u.role}
                              disabled={me || busy}
                              onChange={(e) => void change(u, { role: e.target.value as "admin" | "member" })}
                              className="rounded-[7px] border border-line bg-surface px-1.5 py-1 text-[12.5px] text-ink-2 disabled:opacity-60"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td className="px-2 py-2.5">
                            <button
                              type="button"
                              disabled={me || busy}
                              onClick={() => void change(u, { disabled: !u.disabled })}
                              title={me ? "You can't turn off your own account" : u.disabled ? "Turn this account back on" : "Turn this account off and sign it out"}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] disabled:opacity-60",
                                u.disabled ? "border-line text-muted hover:text-ink" : "border-ok/30 text-ok hover:border-risk/40 hover:text-risk",
                              )}
                            >
                              {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <span aria-hidden className={cn("size-1.5 rounded-full", u.disabled ? "bg-line-strong" : "bg-ok")} />}
                              {u.disabled ? "Off" : "Active"}
                            </button>
                          </td>
                          {[u.today.questions, u.total.questions, u.total.llmCalls, u.total.searches, u.total.actions, u.memories ?? "–", u.files].map((v, i) => (
                            <td key={i} className="tabular px-2 py-2.5 text-right text-ink-2">
                              {v}
                            </td>
                          ))}
                          <td className="px-2 py-2.5 text-right whitespace-nowrap text-muted">{ago(u.lastActive)}</td>
                        </tr>
                      );
                    })}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-2 py-6 text-muted">
                          No accounts match “{query}”.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-2">
              <Apps data={data} onSave={saveSettings} />
              <Limits data={data} onSave={saveSettings} />
            </div>

            <section className="mt-12" aria-labelledby="h-activity">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink pb-2">
                <h2 id="h-activity" className="text-[15px] font-[600] text-ink">
                  Activity
                </h2>
                <div role="tablist" aria-label="Filter activity" className="flex gap-1">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={filter === f.id}
                      onClick={() => setFilter(f.id)}
                      className={cn("rounded-full px-2.5 py-0.5 text-[12.5px]", filter === f.id ? "bg-pressed text-ink" : "text-muted hover:text-ink")}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <ol>
                {activity.map((a, i) => (
                  <li key={i} className="grid grid-cols-[92px_1fr] gap-x-4 border-b border-line py-2.5 text-[13.5px] sm:grid-cols-[110px_150px_1fr]">
                    <span className="text-muted">{ago(a.at)}</span>
                    <span className={cn("font-[550]", KIND[a.kind]?.tone)}>{KIND[a.kind]?.label ?? a.kind}</span>
                    <span className="col-span-2 min-w-0 text-ink-2 sm:col-span-1">
                      <span className="text-muted">{a.actor}</span>
                      {a.target && a.kind.startsWith("admin.") && a.kind !== "admin.settings" ? <> → {emailOf(a.target)}</> : a.target ? <> · {a.target}</> : null}
                      {a.detail && a.kind !== "admin.settings" && <span className="block truncate text-[12.5px] text-muted">{a.detail}</span>}
                    </span>
                  </li>
                ))}
                {activity.length === 0 && <li className="py-6 text-[14px] text-muted">Nothing here yet.</li>}
              </ol>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Apps({ data, onSave }: { data: Overview; onSave: (s: Overview["settings"]) => Promise<void> }) {
  const allowed = data.settings.allowedConnectors;
  const toggle = (id: string) => {
    const all = data.connectors.map((c) => c.id);
    const current = allowed ?? all;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    void onSave({ ...data.settings, allowedConnectors: next.length === all.length ? null : next });
  };
  return (
    <section aria-labelledby="h-apps">
      <h2 id="h-apps" className="border-b border-ink pb-2 text-[15px] font-[600] text-ink">
        Apps
      </h2>
      <p className="mt-2 text-[13px] text-muted">Which apps people may connect and search. Uploaded files are always allowed.</p>
      {data.composio !== "project" && (
        <p className="mt-2 rounded-md border border-line bg-accent-wash px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
          {data.composio === "personal"
            ? "Your Composio key is a personal one (ck_), so every connection belongs to your Composio account. Only admins can connect apps, and they all share those connections; members use the sample workspace."
            : "No Composio key is set, so nobody can connect apps yet."}{" "}
          To let every member connect their own apps, create a project API key at platform.composio.dev (it starts with ak_), put it in COMPOSIO_API_KEY in the root .env and restart Cortex.
        </p>
      )}
      <ul className="mt-2">
        {data.connectors.map((c) => {
          const on = !allowed || allowed.includes(c.id);
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <span className="flex min-w-0 items-center gap-2 text-[14px] text-ink">
                <SourceMark source={c.id} />
                {c.name}
                <span className={cn("truncate text-[12px]", c.connected ? "text-ok" : "text-muted")}>{c.connected ? "working" : c.available ? "not connected" : "not set up"}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`Allow ${c.name}`}
                onClick={() => toggle(c.id)}
                className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200", on ? "bg-accent" : "bg-line-strong")}
              >
                <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-[translate] duration-[260ms] ease-[var(--ease-spring)]", on && "translate-x-4")} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12.5px] text-muted">
        Memory: {data.memory.ok ? <span className="text-ok">working ({data.memory.backend})</span> : <span className="text-warn">out of reach</span>}
      </p>
    </section>
  );
}

function Limits({ data, onSave }: { data: Overview; onSave: (s: Overview["settings"]) => Promise<void> }) {
  const [value, setValue] = useState(data.settings.dailyQuestionLimit?.toString() ?? "");
  const n = value.trim() ? Number(value) : null;
  const valid = n === null || (Number.isInteger(n) && n >= 1 && n <= 10_000);
  const changed = (n ?? null) !== data.settings.dailyQuestionLimit;
  return (
    <section aria-labelledby="h-limits">
      <h2 id="h-limits" className="border-b border-ink pb-2 text-[15px] font-[600] text-ink">
        Limits
      </h2>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && changed) void onSave({ ...data.settings, dailyQuestionLimit: n });
        }}
      >
        <label htmlFor="limit" className="text-[13.5px] text-ink-2">
          Questions per person per day
        </label>
        <div className="flex items-center gap-2">
          <input
            id="limit"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="No limit"
            className="w-32 rounded-[8px] border border-line-strong bg-surface px-2.5 py-1.5 text-[14px] text-ink placeholder:text-hair focus:border-accent/60"
          />
          <button type="submit" disabled={!valid || !changed} className="rounded-[8px] bg-ink px-3 py-1.5 text-[13px] font-[550] text-on-ink hover:bg-ink-2 disabled:opacity-40">
            Save
          </button>
        </div>
        <p className="text-[12.5px] text-muted">
          Leave empty for no limit. People who reach it see a calm note that it resets at midnight (UTC). Each question also has a short burst limit of 20 a minute.
        </p>
      </form>
    </section>
  );
}
