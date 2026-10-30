"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { motion, MotionConfig } from "motion/react";
import { Brain, Cable, FileText, Shield, Sparkles, Menu, MessageSquareText, Monitor, Moon, MoreHorizontal, Newspaper, LogOut, Pencil, Pin, PinOff, Sun, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { onSettings, readSound, readTheme, writeSound, writeTheme, type Theme } from "@/lib/settings";
import { play } from "@/lib/sound";
import { useClerk, useUser } from "@clerk/nextjs";
import { openTour, Tour } from "./tour";
import { Toaster } from "./toaster";
import { claimThreads, deleteThread, syncThreads, onRecent, readThreads, restoreThread, updateThread, type SavedThread } from "@/lib/recent";
import { cn } from "@/lib/ui";

const NAV = [
  { href: "/", label: "Ask", icon: MessageSquareText },
  { href: "/brief", label: "Brief", icon: Newspaper },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/files", label: "Files", icon: FileText },
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
  // A hint only (the admin API checks the role itself); the owner is made admin on their first request.
  const isAdmin = useUser().user?.publicMetadata.role === "admin";
  return (
    <ul className="flex flex-col gap-0.5">
      {[...NAV, ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: Shield }] : [])].map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-sm transition-colors",
                active ? "bg-pressed font-[550] text-ink" : "text-muted hover:bg-hover hover:text-ink",
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
  if (path === "/sign-in" || path === "/sso-callback")
    return (
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster />
      </MotionConfig>
    ); // no app chrome (sidebar, tour) before sign-in

  return (
    <div className="flex h-full min-h-dvh">
      <nav aria-label="Main" className="hidden w-[208px] shrink-0 flex-col px-[18px] py-6 md:flex">
        <Link href="/" className="mb-8 px-2">
          <Wordmark />
        </Link>
        <NavLinks />
        <Suspense fallback={<div className="flex-1" />}>
          <RecentThreads />
        </Suspense>
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
            <Suspense fallback={null}>
              <RecentThreads onNavigate={() => setOpen(false)} />
            </Suspense>
            <div className="mt-3 flex items-center gap-2 border-t border-line px-1 pt-3">
              <ThemeSwitch />
              <SoundSwitch />
            </div>
            <div className="mt-2">
              <Account />
            </div>
          </div>
        )}
        <main className="min-h-0 flex-1 bg-surface">
          {/* Each page eases in when you move between them; MotionConfig makes springs follow reduced motion too. */}
          <MotionConfig reducedMotion="user">
            <div key={path} className="page-enter h-full">
              {children}
            </div>
            <Tour />
            <Toaster />
          </MotionConfig>
        </main>
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
  return (
    <div className="mt-4 flex flex-col items-start gap-1.5">
      <button type="button" onClick={openTour} className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] text-muted hover:text-ink">
        <Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden /> Take the tour
      </button>
      <Account />
      {info && (
        <Link href="/connections" className="readout max-w-full truncate rounded-md px-2.5 py-1.5 text-muted hover:text-ink">
          {info.workspace === "demo" ? "Sample" : "Live"} · {info.count} sources
        </Link>
      )}
      <div className="flex items-center gap-2 px-1.5">
        <ThemeSwitch />
        <SoundSwitch />
      </div>
    </div>
  );
}

function Account() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const owner = user?.id;
  useEffect(() => {
    if (!owner) return;
    claimThreads(owner);
    void syncThreads();
  }, [owner]);
  // Once per browser session, a few seconds in: ask the server to (re)build the brief if it is stale, so opening
  // Brief is instant. The server answers at once and builds in the background; a fresh brief costs nothing.
  useEffect(() => {
    if (!owner) return;
    const t = setTimeout(() => {
      try {
        if (sessionStorage.getItem("cortex.briefWarm")) return;
        sessionStorage.setItem("cortex.briefWarm", "1");
        const pick = JSON.parse(localStorage.getItem("cortex.briefSources") ?? "null") as string[] | null;
        void fetch(`/api/brief${pick?.length ? `?sources=${pick.join(",")}` : ""}`).catch(() => {});
      } catch {}
    }, 5000);
    return () => clearTimeout(t);
  }, [owner]);
  if (!user) return null;
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const name = user.fullName ?? "";
  return (
    <div className="flex w-full min-w-0 items-center gap-2 px-1.5">
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-[600] text-accent-ink uppercase">
        {(name || email).charAt(0)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2" title={email}>
        {email}
      </span>
      <button
        type="button"
        // A full page load on sign-out, so nothing of this account stays in memory.
        onClick={() => void signOut({ redirectUrl: "/sign-in" })}
        aria-label="Sign out"
        title="Sign out"
        className="grid size-7 shrink-0 place-items-center rounded-[8px] text-hair hover:bg-hover hover:text-ink"
      >
        <LogOut className="size-3.5" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Match system", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function ThemeSwitch() {
  const theme = useSyncExternalStore(onSettings, readTheme, () => "system" as Theme);
  const id = useId(); // the switch is mounted twice (sidebar and phone menu); each pill slides on its own
  return (
    <div role="radiogroup" aria-label="Theme" className="flex shrink-0 rounded-[8px] border border-line p-0.5">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => writeTheme(value)}
          className={cn("relative grid size-6 place-items-center rounded-[6px] transition-colors", theme === value ? "text-ink" : "text-hair hover:text-ink")}
        >
          {theme === value && (
            <motion.span layoutId={`theme-${id}`} className="absolute inset-0 rounded-[6px] bg-pressed" transition={{ type: "spring", duration: 0.35, bounce: 0.2 }} />
          )}
          <Icon className="relative size-3.5" strokeWidth={1.75} aria-hidden />
        </button>
      ))}
    </div>
  );
}

function SoundSwitch() {
  const on = useSyncExternalStore(onSettings, readSound, () => true);
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Sounds"
      title={on ? "Sounds on" : "Sounds off"}
      onClick={() => {
        writeSound(!on);
        if (!on) play("send"); // a sample, so turning sound on is heard
      }}
      className={cn("grid size-7 place-items-center rounded-[8px] border border-line transition-colors", on ? "text-ink-2 hover:text-ink" : "text-hair hover:text-ink")}
    >
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

function RecentThreads({ onNavigate }: { onNavigate?: () => void }) {
  const [items, setItems] = useState<SavedThread[]>([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removed, setRemoved] = useState<SavedThread | null>(null);
  const path = usePathname();
  const current = useSearchParams().get("t");
  const router = useRouter();
  useEffect(() => {
    setItems(readThreads());
    return onRecent(() => setItems(readThreads()));
  }, []);
  // The undo offer lasts a few seconds; after that (or on leaving the page) the server copy is deleted too.
  const pending = useRef<SavedThread | null>(null);
  const purge = () => {
    const id = pending.current?.serverThreadId;
    pending.current = null;
    if (id) void fetch(`/api/threads/${encodeURIComponent(id)}`, { method: "DELETE", keepalive: true }).catch(() => {});
  };
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => {
      purge();
      setRemoved(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [removed]);
  useEffect(() => {
    window.addEventListener("pagehide", purge);
    return () => window.removeEventListener("pagehide", purge);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest("[data-thread-menu]")) setMenu(null);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [menu]);

  const rename = (id: string, title: string) => {
    if (title.trim()) updateThread(id, { title: title.trim().slice(0, 120) });
    setRenaming(null);
  };
  const remove = (id: string) => {
    setMenu(null);
    const gone = deleteThread(id);
    purge(); // a newer delete replaces the undo offer for the previous one
    pending.current = gone ?? null;
    if (gone) setRemoved(gone);
    if (current === id) router.push("/");
  };

  const groups = [
    { label: "Pinned", list: items.filter((t) => t.pinned) },
    { label: "Recent", list: items.filter((t) => !t.pinned) },
  ].filter((g) => g.list.length);

  return (
    <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
      {groups.map((g) => (
        <section key={g.label} className="mb-4">
          <p className="readout mb-1.5 px-2.5 text-hair">{g.label}</p>
          <ul className="flex flex-col">
            {g.list.map((t) => {
              const active = path === "/" && current === t.id;
              return (
                <li key={t.id} className="enter group relative" data-thread-menu={menu === t.id ? "" : undefined}>
                  {renaming === t.id ? (
                    <input
                      autoFocus
                      defaultValue={t.title}
                      aria-label="Chat name"
                      onFocus={(e) => e.currentTarget.select()}
                      onBlur={(e) => rename(t.id, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="w-full rounded-md border border-accent/50 bg-surface px-2.5 py-[5px] text-[13px] text-ink outline-none"
                    />
                  ) : (
                    <Link
                      href={`/?t=${t.id}`}
                      onClick={onNavigate}
                      title={t.title}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block truncate rounded-md py-1.5 pr-7 pl-2.5 text-[13px]",
                        active ? "bg-pressed text-ink" : "text-muted hover:bg-hover hover:text-ink",
                      )}
                    >
                      {t.title}
                    </Link>
                  )}
                  {renaming !== t.id && (
                    <button
                      type="button"
                      aria-label={`Options for ${t.title}`}
                      aria-haspopup="menu"
                      aria-expanded={menu === t.id}
                      data-thread-menu
                      onClick={() => setMenu((m) => (m === t.id ? null : t.id))}
                      className={cn(
                        "absolute top-1/2 right-1 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink focus-visible:opacity-100",
                        menu === t.id || active ? "opacity-100" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
                      )}
                    >
                      <MoreHorizontal className="size-4" aria-hidden />
                    </button>
                  )}
                  {menu === t.id && (
                    <div role="menu" data-thread-menu className="absolute top-full right-0 z-10 mt-1 flex w-36 flex-col rounded-md border border-line bg-surface py-1 text-[13px]">
                      <button type="button" role="menuitem" onClick={() => (setMenu(null), setRenaming(t.id))} className="flex items-center gap-2 px-3 py-1.5 text-left text-ink-2 hover:bg-hover">
                        <Pencil className="size-3.5" aria-hidden /> Rename
                      </button>
                      <button type="button" role="menuitem" onClick={() => (setMenu(null), updateThread(t.id, { pinned: !t.pinned }))} className="flex items-center gap-2 px-3 py-1.5 text-left text-ink-2 hover:bg-hover">
                        {t.pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />} {t.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button type="button" role="menuitem" onClick={() => remove(t.id)} className="flex items-center gap-2 px-3 py-1.5 text-left text-risk hover:bg-risk-soft">
                        <Trash2 className="size-3.5" aria-hidden /> Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {removed && (
        <p role="status" className="enter mx-1 flex items-center justify-between gap-2 rounded-md bg-hover px-2.5 py-2 text-[13px] text-ink-2">
          <span className="truncate">Chat deleted</span>
          <button
            type="button"
            onClick={() => {
              pending.current = null;
              restoreThread(removed);
              setRemoved(null);
            }}
            className="font-[550] text-accent-ink hover:underline"
          >
            Undo
          </button>
        </p>
      )}
    </div>
  );
}
