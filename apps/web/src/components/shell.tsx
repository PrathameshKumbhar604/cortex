"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Brain, Cable, Menu, MessageSquareText, Newspaper, X } from "lucide-react";
import { onRecent, readRecent } from "@/lib/recent";
import { cn } from "@/lib/ui";

const NAV = [
  { href: "/", label: "Ask", icon: MessageSquareText },
  { href: "/brief", label: "Brief", icon: Newspaper },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/connections", label: "Connections", icon: Cable },
];

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-[17px] font-[650] tracking-[-0.02em] text-ink">
      <span aria-hidden className="size-[9px] rounded-full bg-accent" />
      Cortex
    </span>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-sm transition-colors",
                active ? "bg-[#eceef3] font-[550] text-ink" : "text-muted hover:bg-[#f0f1f5] hover:text-ink",
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  return (
    <div className="flex h-full min-h-dvh">
      <nav aria-label="Main" className="hidden w-[208px] shrink-0 flex-col px-[18px] py-6 md:flex">
        <Link href="/" className="mb-8 px-2">
          <Wordmark />
        </Link>
        <NavLinks />
        <RecentQuestions />
        <WorkspaceFooter />
      </nav>

      <div className="flex min-w-0 flex-1 flex-col md:border-l md:border-line">
        <header className="flex items-center justify-between border-b border-line bg-shell px-4 py-3 md:hidden">
          <Wordmark />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="rounded-md p-1.5 text-muted hover:text-ink"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </header>
        {open && (
          <div className="border-b border-line bg-shell px-3 py-3 md:hidden">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        )}
        <main className="min-h-0 flex-1 bg-surface">{children}</main>
      </div>
    </div>
  );
}

function WorkspaceFooter() {
  const [info, setInfo] = useState<{ workspace: string; count: number } | null>(null);
  const path = usePathname();
  useEffect(() => {
    let live = true;
    fetch("/api/connections")
      .then((r) => r.json())
      .then((d: { workspace: string; connectors: { connected: boolean }[] }) => {
        if (live) setInfo({ workspace: d.workspace, count: d.connectors.filter((c) => c.connected).length });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path]);
  if (!info) return null;
  return (
    <Link href="/connections" className="readout mt-4 truncate rounded-md px-2.5 py-2 text-muted hover:text-ink">
      {info.workspace === "demo" ? "Sample" : "Live"} · {info.count} sources
    </Link>
  );
}

function RecentQuestions() {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    setItems(readRecent());
    return onRecent(() => setItems(readRecent()));
  }, []);
  return (
    <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
      {items.length > 0 && (
        <>
          <p className="readout mb-1.5 px-2.5 text-hair">Recent</p>
          <ul className="flex flex-col">
            {items.map((q) => (
              <li key={q}>
                <Link
                  href={`/?q=${encodeURIComponent(q)}`}
                  title={q}
                  className="block truncate rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:bg-[#f0f1f5] hover:text-ink"
                >
                  {q}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
