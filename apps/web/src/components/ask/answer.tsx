"use client";

import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import type { Claim, Evidence } from "@cortex/shared";
import { cn, sourceColor } from "@/lib/ui";

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
 * Renders the answer as full markdown (lists, tables, code). Its weight is its verification state: hairline while
 * it is being checked, full weight once checked; sentences only partly backed by their source get a dotted underline.
 */
export function Answer({ text, claims, evidence, verified, streaming, onCite, onJump }: Props) {
  const partial = claims.filter((c) => c.status === "partial").map((c) => plain(c.text)).filter((t) => t.length > 12);
  const mark = (children: ReactNode) => (partial.length ? Children.map(children, (c) => (typeof c === "string" ? markPartial(c, partial) : c)) : children);

  const components: Components = {
    p: ({ children }) => <p className="mb-4 text-pretty">{mark(children)}</p>,
    li: ({ children }) => <li className="pl-1 [&>p]:mb-1">{mark(children)}</li>,
    ul: ({ children }) => <ul className="mb-4 flex list-disc flex-col gap-1.5 pl-5 marker:text-hair [&_ul]:mt-1.5 [&_ul]:mb-0">{children}</ul>,
    ol: ({ children }) => <ol className="mb-4 flex list-decimal flex-col gap-1.5 pl-6 marker:text-muted [&_ol]:mt-1.5 [&_ol]:mb-0">{children}</ol>,
    h1: ({ children }) => <h3 className="mt-7 mb-2 text-[20px] font-[600] tracking-[-0.015em] text-ink">{children}</h3>,
    h2: ({ children }) => <h3 className="mt-6 mb-2 text-[17px] font-[600] tracking-[-0.01em] text-ink">{children}</h3>,
    h3: ({ children }) => <h4 className="mt-5 mb-2 text-[15px] font-[600] text-ink">{children}</h4>,
    h4: ({ children }) => <h4 className="mt-4 mb-1.5 text-[15px] font-[600] text-ink-2">{children}</h4>,
    strong: ({ children }) => <strong className="font-[600]">{children}</strong>,
    blockquote: ({ children }) => <blockquote className="mb-4 border-l-2 border-line-strong pl-4 text-ink-2 [&>p]:mb-2">{children}</blockquote>,
    hr: () => <hr className="my-6 border-line" />,
    table: ({ children }) => (
      <div className="mb-5 overflow-x-auto rounded-[10px] border border-line">
        <table className="w-full border-collapse text-left text-[14.5px] leading-snug">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b border-line bg-shell px-3 py-2 font-[600] whitespace-nowrap text-ink">{children}</th>,
    td: ({ children }) => <td className="border-b border-line px-3 py-2 align-top text-ink-2 [tr:last-child_&]:border-b-0">{mark(children)}</td>,
    a: ({ href, children }) => {
      const n = href?.startsWith("#cite-") ? Number(href.slice(6)) : 0;
      if (n) {
        const ev = evidence[n - 1];
        return ev ? <Cite n={n} ev={ev} onCite={onCite} onJump={onJump} /> : null; // a citation to nothing is dropped
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" className="text-accent-ink underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
          {children}
        </a>
      );
    },
    code: ({ children }) => <code className="rounded bg-shell px-1 py-px font-mono text-[0.86em] text-ink-2">{children}</code>,
    pre: ({ children }) => {
      const code = Children.toArray(children).find(isValidElement) as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
      const lang = code?.props.className?.match(/language-([\w+#-]+)/)?.[1];
      return <Terminal lang={lang} code={String(code?.props.children ?? "").replace(/\n$/, "")} />;
    },
  };

  return (
    <div className={cn("claim text-[17px] leading-[1.7] text-ink", streaming && "streaming")} data-state={verified ? "plain" : "pending"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {withCitationLinks(text)}
      </ReactMarkdown>
    </div>
  );
}

const SHELL = new Set(["bash", "sh", "shell", "zsh", "console", "powershell", "ps1", "pwsh", "cmd", "bat", "terminal"]);

/** Code is shown the way it will be used: a terminal panel, copyable in one click. */
function Terminal({ lang, code }: { lang?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the text is still selectable
    }
  };
  return (
    <div className="terminal mb-5 overflow-hidden rounded-[10px] border border-[#23262d] bg-[#0f1115] text-[#d5d8df]">
      <div className="flex items-center justify-between gap-3 border-b border-[#23262d] py-1.5 pr-1.5 pl-3">
        <span className="font-mono text-[11.5px] tracking-[0.02em] text-[#8b919c]">{!lang ? "code" : SHELL.has(lang.toLowerCase()) ? "terminal" : lang}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="press inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px] text-[#a9aeb8] hover:bg-[#1d2027] hover:text-white"
        >
          {copied ? <Check className="size-3.5 text-[#3dd68c]" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-[1.65] [tab-size:2]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** "[3]" becomes a link the renderer turns into a citation; code (fenced or inline) is left alone. */
function withCitationLinks(md: string) {
  return md
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/((?:\s*\[\d+\])+)([.,;:])/g, "$2$1").replace(/\[(\d+)\](?!\()/g, "[$1](#cite-$1)")))
    .join("");
}

/** A claim as it reads on screen: no markdown, citations or list markers. */
function plain(s: string) {
  return s
    .replace(/\s*\[\d+\]/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(?:[-*•]|\d+\.)\s+/, "")
    .replace(/[.,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function markPartial(s: string, partial: string[]): ReactNode {
  for (const p of partial) {
    const at = s.indexOf(p);
    if (at < 0) continue;
    return (
      <>
        {s.slice(0, at)}
        <span className="claim" data-state="partial" title="Only partly supported by the cited source">
          {p}
        </span>
        {markPartial(s.slice(at + p.length), partial)}
      </>
    );
  }
  return s;
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
