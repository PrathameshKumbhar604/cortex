"use client";

import { Children, isValidElement, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { sourceName, type Claim, type Evidence } from "@cortex/shared";
import { cn, shortDate } from "@/lib/ui";
import { SourceIcon } from "./sources";

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
  const partial = useMemo(() => claims.filter((c) => c.status === "partial").map((c) => plain(c.text)).filter((t) => t.length > 12), [claims]);

  // Stable while text streams: a new components object would remount every paragraph (and close an open citation preview) per token.
  const components = useMemo<Components>(() => {
    const mark = (children: ReactNode) => (partial.length ? Children.map(children, (c) => (typeof c === "string" ? markPartial(c, partial) : c)) : children);
    return {
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
  }, [partial, evidence, onCite, onJump]);

  return (
    <div className={cn("claim text-[17px] leading-[1.7] text-ink", streaming && "streaming")} data-state={verified ? "plain" : "pending"}>
      <ReactMarkdown remarkPlugins={PLUGINS} components={components}>
        {withCitationLinks(text)}
      </ReactMarkdown>
    </div>
  );
}

const PLUGINS = [remarkGfm];
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
    <div className="terminal mb-5 overflow-hidden rounded-[10px] border border-[#23262d] bg-[#0a0b0f] text-[#d5d8df]">
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

/**
 * A numbered superscript pill. Hover (mouse) or keyboard focus previews the source; click jumps to it in the list.
 * The preview stays open while hovered, and Escape closes it.
 */
export function Cite({ n, ev, onCite, onJump }: { n: number; ev: Evidence; onCite: (id: string | null) => void; onJump: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const card = useRef<HTMLSpanElement>(null);
  const show = (on: boolean) => {
    setOpen(on);
    onCite(on ? ev.id : null);
  };

  // Keep the preview inside the viewport: shift it sideways, and drop it below the marker near the top.
  useLayoutEffect(() => {
    const el = card.current;
    if (!open || !el) return;
    el.style.translate = "";
    el.dataset.below = "";
    const r = el.getBoundingClientRect();
    const pad = 12;
    const dx = r.left < pad ? pad - r.left : r.right > innerWidth - pad ? innerWidth - pad - r.right : 0;
    if (dx) el.style.translate = `calc(-50% + ${dx}px) 0`; // Tailwind's -translate-x-1/2 is the `translate` property too
    // shortcut: 80px approximates the app header; measure the scroll container if the header grows.
    if (r.top < 80) el.dataset.below = "1";
  }, [open]);

  return (
    <span
      className="relative inline-block"
      onPointerEnter={(e) => e.pointerType === "mouse" && show(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && show(false)}
    >
      <button
        type="button"
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && show(true)}
        onBlur={() => show(false)}
        onKeyDown={(e) => e.key === "Escape" && open && (e.stopPropagation(), show(false))}
        onClick={() => onJump(ev.id)}
        aria-label={`Source ${n}`}
        aria-describedby={tipId}
        className={cn(
          "mx-[1px] inline-grid h-[17px] min-w-[17px] -translate-y-[0.4em] place-items-center rounded-full px-[4px] align-baseline font-mono text-[10.5px] font-medium leading-none ring-1 ring-inset transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
          open ? "bg-accent-soft text-accent-ink ring-transparent" : "bg-accent-wash text-ink-2 ring-line-strong/70 hover:bg-accent-soft hover:text-accent-ink",
        )}
      >
        {n}
      </button>
      <span
        ref={card}
        id={tipId}
        role="tooltip"
        data-open={open || undefined}
        className={cn(
          "absolute left-1/2 z-30 w-[min(19rem,calc(100vw-2rem))] -translate-x-1/2 text-left font-sans whitespace-normal",
          "bottom-full pb-2 data-[below=1]:top-full data-[below=1]:bottom-auto data-[below=1]:pt-2 data-[below=1]:pb-0",
          "invisible scale-[0.97] opacity-0 transition-[opacity,scale,visibility] duration-150 ease-out data-open:visible data-open:scale-100 data-open:opacity-100",
        )}
      >
        <span className="block rounded-[10px] border border-line-strong bg-surface p-3 shadow-[0_10px_30px_-12px_rgb(14_17_22/0.28)]">
          <span className="readout flex items-center gap-1.5 text-muted">
            <SourceIcon source={ev.source} />
            <span className="truncate">
              {sourceName(ev.source)}
              {ev.timestamp ? ` · ${shortDate(ev.timestamp)}` : ""}
            </span>
          </span>
          <span className="mt-1.5 block text-[13.5px] font-[550] leading-snug text-ink">{ev.title}</span>
          {ev.quote && <span className="mt-1 line-clamp-3 block text-[13px] leading-[1.45] text-ink-2">{ev.quote}</span>}
        </span>
      </span>
    </span>
  );
}
