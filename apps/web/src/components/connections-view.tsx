"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { ConnectorStatus } from "@cortex/shared";
import { cn } from "@/lib/ui";
import { explainError } from "@cortex/shared";
import { Problem } from "./problem";
import { SourceMark } from "./ask/sources";

interface Info {
  workspace: "demo" | "live";
  liveAvailable: boolean;
  admin: boolean;
  connectors: ConnectorStatus[];
  memory: { ok: boolean; backend: string };
  llm: { id: string; label: string }[];
}

const WHAT: Record<string, string> = {
  gmail: "Emails, requests and replies",
  calendar: "Meetings and deadlines",
  drive: "Docs, reports and files",
  notion: "Specs, goals and notes",
  slack: "Team discussions and blockers",
  github: "Issues, pull requests, milestones",
  web: "Public web pages and search",
};

/** A centered, sized window that shows progress at once, before the sign-in link exists (and isn't popup-blocked). */
function openSignInWindow(name: string): Window | null {
  const w = 520, h = 680;
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
  const win = window.open("", "cortex-connect", `popup,width=${w},height=${h},left=${left},top=${top}`);
  if (!win) return null;
  win.document.title = `Connect ${name}`;
  win.document.body.innerHTML = `<p style="font:15px/1.5 system-ui,sans-serif;color:GrayText;text-align:center;margin-top:42vh">Opening ${name} sign-in…</p>`;
  win.document.body.style.cssText = "margin:0;color-scheme:light dark;background:Canvas";
  return win;
}

export function ConnectionsView() {
  const [info, setInfo] = useState<Info | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState<string | null>(null);
  const popup = useRef<Window | null>(null);
  const params = useSearchParams();

  const load = useCallback(async () => {
    const res = await fetch("/api/connections");
    const next = (await res.json()) as Info;
    setInfo(next);
    return next;
  }, []);

  useEffect(() => {
    void load();
    const onFocus = () => void load(); // OAuth finishes in a popup; refresh when the user comes back
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const connected = params.get("connected") ?? justConnected;

  // Project-key OAuth returns to /connections?connected=… inside the popup: close it.
  useEffect(() => {
    if (params.get("connected") && window.opener) window.close();
  }, [params]);

  // Hosted sign-in ends on the provider's page, which can't close itself; close the popup once the source is connected.
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      const next = await load().catch(() => null);
      if (next?.connectors.some((c) => c.id === waiting && c.connected)) {
        popup.current?.close();
        window.focus();
        setJustConnected(waiting);
        setWaiting(null);
        setBlockedUrl(null);
      } else if ((popup.current?.closed && !blockedUrl) || Date.now() - started > 5 * 60_000) {
        setWaiting(null);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [waiting, load, blockedUrl]);

  const switchTo = async (workspace: "demo" | "live") => {
    setError(null);
    const res = await fetch("/api/connections", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace }) });
    if (!res.ok) setError(((await res.json()) as { error: string }).error);
    await load();
  };

  // OAuth can't run inside the page (Google refuses to be framed) and Composio Connect has no return link, so sign-in
  // happens in a window opened on the click itself; this page polls and closes it once the app shows up connected.
  const connect = async (id: string, name: string) => {
    setPending(id);
    setError(null);
    setBlockedUrl(null);
    setJustConnected(null);
    popup.current = openSignInWindow(name);
    try {
      const res = await fetch(`/api/connections/${id}`, { method: "POST" });
      const body = (await res.json()) as { redirectUrl?: string; error?: string };
      if (!res.ok || !body.redirectUrl) throw new Error(body.error ?? "Couldn't start sign-in.");
      if (popup.current && !popup.current.closed) popup.current.location.replace(body.redirectUrl);
      else setBlockedUrl(body.redirectUrl); // pop-ups blocked: offer the link instead
      setWaiting(id);
    } catch (e) {
      popup.current?.close();
      setError(e instanceof Error ? e.message : "Couldn't start sign-in.");
    } finally {
      setPending(null);
    }
  };

  const cancel = () => {
    popup.current?.close();
    setWaiting(null);
    setBlockedUrl(null);
  };

  const disconnect = async (id: string) => {
    setDisconnecting(id);
    setError(null);
    try {
      const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't disconnect.");
      if (justConnected === id) setJustConnected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't disconnect.");
    } finally {
      setDisconnecting(null);
      setConfirmOff(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 pt-10 pb-16 sm:px-6 md:pt-16">
        <h1 className="text-[32px] font-[400] leading-[1.15] tracking-[-0.015em] text-ink sm:text-[40px]">Where Cortex looks</h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted">
          Connect an app once. You sign in with that app directly, and Cortex never sees your password. It reads to answer questions and acts only
          after you approve each action.
        </p>

        <div role="radiogroup" aria-label="Workspace" className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              { id: "demo", label: "Sample workspace", note: "Fictional student team data. Nothing leaves Cortex." },
              { id: "live", label: "Your accounts", note: info?.liveAvailable ? "Your own Gmail, Slack, GitHub and more." : "Not available on this Cortex yet." },
            ] as const
          ).map((w) => (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={info?.workspace === w.id}
              onClick={() => switchTo(w.id)}
              disabled={w.id === "live" && info ? !info.liveAvailable : false}
              className={cn(
                "rounded-[12px] border bg-surface p-4 text-left shadow-[var(--raise)] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                info?.workspace === w.id ? "border-accent bg-accent-soft/50" : "border-line hover:border-line-strong",
              )}
            >
              <span className="flex items-center justify-between text-[15px] font-[550] text-ink">
                {w.label}
                {info?.workspace === w.id && <Check className="size-4 text-accent" aria-hidden />}
              </span>
              <span className="mt-1 block text-[13px] text-muted">{w.note}</span>
            </button>
          ))}
        </div>

        {connected && !waiting && (
          <p role="status" className="mt-6 rounded-md bg-accent-soft px-3 py-2 text-[14px] text-accent-ink">
            {info?.connectors.find((c) => c.id === connected)?.name ?? "It"} is connected. Cortex can search it now.
          </p>
        )}
        {error && (
          <div className="mt-6">
            <Problem problem={explainError(error)} variant="card" />
          </div>
        )}

        <ul className="mt-10 border-t border-ink">
          {/* Uploads live on the Files page; they aren't an app to connect. */}
          {(info?.connectors ?? []).filter((c) => c.kind !== "upload").map((c) => (
            <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-line py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[15.5px] font-[500] text-ink">
                  <SourceMark source={c.id} className="size-2" />
                  {c.name}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {WHAT[c.id] ?? "Connected through MCP"}
                  {c.canAct ? " · can act with your approval" : " · read-only"}
                </p>
                {!c.connected && c.detail && waiting !== c.id && pending !== c.id && <p className="mt-1 text-[12.5px] text-warn">{c.detail}</p>}
                {(pending === c.id || waiting === c.id) && (
                  <p role="status" className="mt-1 text-[12.5px] text-ink-2">
                    {pending === c.id ? (
                      `Opening ${c.name} sign-in…`
                    ) : blockedUrl ? (
                      <>
                        Your browser blocked the sign-in window.{" "}
                        <a href={blockedUrl} target="_blank" rel="noreferrer" className="font-[550] text-accent-ink underline underline-offset-2">
                          Open {c.name} sign-in
                        </a>
                      </>
                    ) : (
                      `Finish signing in to ${c.name} in the window that opened. This page updates by itself.`
                    )}{" "}
                    {waiting === c.id && (
                      <button type="button" onClick={cancel} className="text-muted underline underline-offset-2 hover:text-ink">
                        Cancel
                      </button>
                    )}
                  </p>
                )}
              </div>
              {c.connected ? (
                <div className="flex items-center gap-3">
                  {confirmOff === c.id ? (
                    <>
                      <button type="button" onClick={() => setConfirmOff(null)} className="text-[12.5px] text-muted hover:text-ink">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => disconnect(c.id)}
                        disabled={disconnecting === c.id}
                        autoFocus
                        className="inline-flex items-center gap-1.5 rounded-md bg-risk px-2.5 py-1 text-[12.5px] font-[550] text-on-ink disabled:opacity-60"
                      >
                        {disconnecting === c.id && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                        Disconnect {c.name}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-1.5 text-[12.5px] text-ok">
                        <span aria-hidden className="size-1.5 rounded-full bg-ok" />
                        {c.kind === "demo" ? "Sample data" : "Connected"}
                      </span>
                      {c.kind === "composio" && (
                        <button type="button" onClick={() => setConfirmOff(c.id)} className="text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline">
                          Disconnect
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => connect(c.id, c.name)}
                  disabled={pending === c.id || waiting === c.id || info?.workspace !== "live"}
                  className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-on-ink hover:bg-ink-2 disabled:opacity-50"
                >
                  {(pending === c.id || waiting === c.id) && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  {pending === c.id ? "Opening…" : waiting === c.id ? "Waiting…" : c.detail ? "Reconnect" : "Connect"}
                </button>
              )}
            </li>
          ))}
          {info && !info.connectors.some((c) => c.kind !== "upload") && (
            <li className="border-b border-line py-6 text-[14px] text-muted">No apps to connect here yet. Use the sample workspace to try Cortex.</li>
          )}
        </ul>

        {info && (
          <dl className="mt-12 grid grid-cols-1 gap-6 border-t border-line pt-6 sm:grid-cols-2">
            <div>
              <dt className="text-[12.5px] text-muted">Language models</dt>
              <dd className="mt-1.5 text-[14px] text-ink-2">
                {info.llm.length ? info.llm.map((p) => p.label).join(" → ") : <span className="text-risk">Answers are unavailable right now.</span>}
              </dd>
              <dd className="text-[12.5px] text-muted mt-1">Free AI models, with automatic backup when one is busy.</dd>
            </div>
            <div>
              <dt className="text-[12.5px] text-muted">Memory</dt>
              <dd className="mt-1.5 text-[14px] text-ink-2">
                {info.memory.ok ? (info.memory.backend === "oracle" ? "Saved securely in the cloud" : "Saved on this device") : <span className="text-risk">Offline. Answers still work, but nothing is remembered.</span>}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
