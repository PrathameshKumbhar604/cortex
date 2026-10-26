"use client";

import { Fragment } from "react";
import { lineUnits, type Claim, type Evidence } from "@cortex/shared";
import { cn, sourceColor } from "@/lib/ui";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

interface Props {
  text: string;
  claims: Claim[];
  evidence: Evidence[];
  verified: boolean;
  streaming: boolean;
  onCite: (id: string | null) => void;
  onJump: (id: string) => void;
}

/**
 * Renders the answer claim by claim. Each claim's weight is its verification
 * state: hairline while unchecked, full weight once supported.
 */
export function Answer({ text, claims, evidence, verified, streaming, onCite, onJump }: Props) {
  const status = new Map(claims.map((c) => [norm(c.text), c.status]));
  const blocks = toBlocks(text);

  const renderLine = (line: string, key: number) => {
    const body = line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, "").replace(/^#+\s*/, "");
    const units = lineUnits(line);
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    units.forEach((u, i) => {
      const at = body.indexOf(u, cursor);
      if (at < 0) return;
      if (at > cursor) parts.push(<Inline key={`g${i}`} text={body.slice(cursor, at)} evidence={evidence} onCite={onCite} onJump={onJump} />);
      const state = verified ? status.get(norm(u)) ?? "plain" : "pending";
      parts.push(
        <span
          key={`u${i}`}
          className="claim"
          data-state={state}
          title={state === "unsupported" ? "Not supported by your sources" : state === "partial" ? "Only partly supported by the cited source" : undefined}
        >
          <Inline text={u} evidence={evidence} onCite={onCite} onJump={onJump} />
        </span>,
      );
      cursor = at + u.length;
    });
    if (cursor < body.length) {
      const rest = body.slice(cursor);
      parts.push(
        <span key="rest" className="claim" data-state={verified ? "plain" : "pending"}>
          <Inline text={rest} evidence={evidence} onCite={onCite} onJump={onJump} />
        </span>,
      );
    }
    return <Fragment key={key}>{parts}</Fragment>;
  };

  return (
    <div className={cn("text-[17px] leading-[1.7] text-ink", streaming && "streaming")}>
      {blocks.map((b, i) => {
        if (b.kind === "heading")
          return (
            <h3 key={i} className="mt-6 mb-2 text-[15px] font-[600] tracking-[-0.01em] text-ink">
              {renderLine(b.lines[0]!, 0)}
            </h3>
          );
        // Drafts (code or quoted) are Cortex's own writing, not claims about your data: no weighting.
        if (b.kind === "code" || b.kind === "quote")
          return (
            <blockquote key={i} className="mb-4 border-l border-line-strong pl-4 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-2">
              {b.lines.join("\n").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[\d+\]/g, "")}
            </blockquote>
          );
        if (b.kind === "list")
          return (
            <ul key={i} className="mb-4 flex flex-col gap-1.5 pl-5 marker:text-hair [list-style:disc]">
              {b.lines.map((l, j) => (
                <li key={j} className="pl-1">
                  {renderLine(l, j)}
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="mb-4 text-pretty">
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && " "}
                {renderLine(l, j)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

type Block = { kind: "p" | "list" | "heading" | "code" | "quote"; lines: string[] };

function toBlocks(text: string): Block[] {
  const out: Block[] = [];
  let fence: Block | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      if (fence) fence = null;
      else out.push((fence = { kind: "code", lines: [] }));
      continue;
    }
    if (fence) {
      fence.lines.push(raw);
      continue;
    }
    if (!line.trim()) {
      out.push({ kind: "p", lines: [] });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const last = out.at(-1);
      const text = line.replace(/^\s*>\s?/, "");
      if (last?.kind === "quote") last.lines.push(text);
      else out.push({ kind: "quote", lines: [text] });
      continue;
    }
    const kind: Block["kind"] = /^\s*(?:[-*•]|\d+\.)\s+/.test(line) ? "list" : /^#+\s/.test(line) ? "heading" : "p";
    const last = out.at(-1);
    if (kind === "heading") out.push({ kind, lines: [line] });
    else if (last && last.kind === kind && last.lines.length) last.lines.push(line);
    else out.push({ kind, lines: [line] });
  }
  return out.filter((b) => b.lines.length);
}

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[\d+\]|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;

function Inline({
  text,
  evidence,
  onCite,
  onJump,
}: {
  text: string;
  evidence: Evidence[];
  onCite: (id: string | null) => void;
  onJump: (id: string) => void;
}) {
  return (
    <>
      {text.replace(/((?:\s*\[\d+\])+)([.,;:])/g, "$2$1").split(TOKEN).map((part, i) => {
        if (!part) return null;
        const cite = part.match(/^\[(\d+)\]$/);
        if (cite) {
          const ev = evidence[Number(cite[1]) - 1];
          if (!ev) return null; // a citation to nothing is dropped, and verification flags the claim
          return <Cite key={i} n={Number(cite[1])} ev={ev} onCite={onCite} onJump={onJump} />;
        }
        if (part.startsWith("**")) return <strong key={i} className="font-[600]">{part.slice(2, -2)}</strong>;
        if (part.startsWith("`")) return <code key={i} className="rounded bg-shell px-1 font-mono text-[0.88em]">{part.slice(1, -1)}</code>;
        const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
        if (link)
          return (
            <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-accent-ink underline decoration-accent/40 hover:decoration-accent">
              {link[1]}
            </a>
          );
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export function Cite({ n, ev, onCite, onJump }: { n: number; ev: Evidence; onCite: (id: string | null) => void; onJump: (id: string) => void }) {
  return (
    <button
      type="button"
      onMouseEnter={() => onCite(ev.id)}
      onMouseLeave={() => onCite(null)}
      onFocus={() => onCite(ev.id)}
      onBlur={() => onCite(null)}
      onClick={() => onJump(ev.id)}
      aria-label={`Source ${n}: ${ev.title}`}
      className="ml-[2px] inline-flex -translate-y-[0.35em] items-center gap-[3px] rounded-[4px] px-[3px] align-baseline font-mono text-[11.5px] font-medium leading-none text-accent-ink hover:bg-accent-soft"
    >
      <span aria-hidden className="size-[5px] rounded-full" style={{ background: sourceColor(ev.source) }} />
      {n}
    </button>
  );
}
