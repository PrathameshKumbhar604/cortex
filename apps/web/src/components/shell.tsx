"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Brain, Cable, ChevronsUpDown, Shield, Sparkles, Menu, MessageSquareText, Monitor, Moon, MoreHorizontal, Newspaper, LogOut, PanelLeftClose, PanelLeftOpen, Pencil, Pin, PinOff, Sun, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { onSettings, readSound, readTheme, writeSound, writeTheme, type Theme } from "@/lib/settings";
import { play } from "@/lib/sound";
import { useClerk, useUser } from "@clerk/nextjs";
import { Interstitial } from "./interstitial";
import { endTourOffer, openTour, Tour, tourInSidebar } from "./tour";
import { Toaster } from "./toaster";
import { claimThreads, deleteThread, syncThreads, onRecent, readThreads, restoreThread, updateThread, type SavedThread } from "@/lib/recent";
import { cn } from "@/lib/ui";

const NAV = [
  { href: "/", label: "Ask", icon: MessageSquareText },
  { href: "/brief", label: "Brief", icon: Newspaper },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/connections", label: "Connections", icon: Cable },
];

const SIDEBAR = { initial: 208, min: 180, max: 360, key: "cortex.sidebarWidth", closedKey: "cortex.sidebarClosed" };

/** The Cortex mark: an open C that folds in on itself, like a fold of the cortex, around the point being answered. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-5 text-accent", className)} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M18.4 6.6A8.5 8.5 0 1 0 18.4 17.4" />
      <path d="M15.2 9.4A4.3 4.3 0 1 0 15.2 14.6" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 font-serif text-[21px] font-[500] tracking-[-0.01em] text-ink">
      <Mark />
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
                active ? "nav-active font-[550] text-ink" : "text-muted hover:bg-hover hover:text-ink",
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
  const [width, setWidth] = useState(SIDEBAR.initial);
  const [closed, setClosed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; w: number } | null>(null);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SIDEBAR.key));
      if (saved) setWidth(Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, saved)));
      setClosed(localStorage.getItem(SIDEBAR.closedKey) === "1");
    } catch {}
  }, []);
  const toggle = () =>
    setClosed((c) => {
      try {
        localStorage.setItem(SIDEBAR.closedKey, c ? "0" : "1");
      } catch {}
      return !c;
    });
  // Ctrl/Cmd+B opens and closes the sidebar, as in most editors.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const info = useWorkspace();
  useAccountSync();
  const resize = (w: number) => {
    const next = Math.round(Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, w)));
    setWidth(next);
    try {
      localStorage.setItem(SIDEBAR.key, String(next));
    } catch {}
  };
  if (path === "/sign-in" || path === "/sso-callback")
    return (
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster />
      </MotionConfig>
    ); // no app chrome (sidebar, tour) before sign-in

  return (
    <div className="flex h-full min-h-dvh">
      {/* Closing slides the width to 0; the inner column keeps its width so nothing reflows on the way. */}
      <nav
        id="sidebar"
        aria-label="Main"
        inert={closed}
        style={{ width: closed ? 0 : width }}
        className={cn("sticky top-0 hidden h-dvh shrink-0 overflow-hidden md:block", !dragging && "transition-[width] duration-300 ease-[var(--ease-out)]")}
      >
        <div style={{ width }} className="flex h-full flex-col px-[18px] py-6">
          <div className="mb-8 flex items-center justify-between pl-2">
            <Link href="/">
              <Wordmark />
            </Link>
            <button type="button" onClick={toggle} aria-label="Close sidebar" title="Close sidebar (Ctrl+B)" className="grid size-7 place-items-center rounded-[8px] text-hair hover:bg-hover hover:text-ink">
              <PanelLeftClose className="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <NavLinks />
          <Suspense fallback={<div className="flex-1" />}>
            <RecentThreads />
          </Suspense>
          <SidebarFooter info={info} />
        </div>
      </nav>
      <div
        hidden={closed}
        role="separator"
        aria-orientation="vertical"
        aria-controls="sidebar"
        aria-label="Resize sidebar"
        aria-valuemin={SIDEBAR.min}
        aria-valuemax={SIDEBAR.max}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize, double-click to reset"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, w: width };
          setDragging(true);
        }}
        onPointerMove={(e) => drag.current && resize(drag.current.w + e.clientX - drag.current.x)}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onDoubleClick={() => resize(SIDEBAR.initial)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            resize(width + (e.key === "ArrowLeft" ? -16 : 16));
          }
        }}
        className="group relative z-10 -mr-1.5 hidden w-1.5 shrink-0 cursor-col-resize touch-none outline-none md:block"
      >
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--divider)] transition-colors group-hover:bg-accent group-focus-visible:bg-accent group-active:bg-accent" />
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <AnimatePresence>
          {closed && (
            <motion.button
              type="button"
              onClick={toggle}
              aria-label="Open sidebar"
              title="Open sidebar (Ctrl+B)"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6, transition: { duration: 0.12 } }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              className="absolute top-4 left-4 z-20 hidden size-8 place-items-center rounded-[8px] border border-line bg-surface text-muted hover:bg-hover hover:text-ink md:grid"
            >
              <PanelLeftOpen className="size-4" strokeWidth={1.75} aria-hidden />
            </motion.button>
          )}
        </AnimatePresence>
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
            <div className="mt-3 border-t border-line pt-2">
              <AccountMenu info={info} placement="down" />
            </div>
          </div>
        )}
        <main className="app-panel min-h-0 flex-1 bg-surface shadow-[var(--raise)]">
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

interface WorkspaceInfo {
  workspace: "demo" | "live";
  count: number;
  admin: boolean;
}

/** Workspace, connected sources and admin flag, refreshed on every page change. The admin flag comes from the server. */
function useWorkspace() {
  const [info, setInfo] = useState<WorkspaceInfo | null>(null);
  const path = usePathname();
  useEffect(() => {
    if (path === "/sign-in" || path === "/sso-callback") return;
    let live = true;
    fetch("/api/connections")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { workspace: WorkspaceInfo["workspace"]; admin?: boolean; connectors: { connected: boolean }[] } | null) => {
        if (live && d) setInfo({ workspace: d.workspace, count: d.connectors.filter((c) => c.connected).length, admin: d.admin === true });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path]);
  return info;
}

/** Once per signed-in account: claim this browser's chats, and warm the brief so opening it is instant. */
function useAccountSync() {
  const owner = useUser().user?.id;
  useEffect(() => {
    if (!owner) return;
    claimThreads(owner);
    void syncThreads();
  }, [owner]);
  // Once per browser session, a few seconds in: ask the server to (re)build the brief if it is stale. The server answers
  // at once and builds in the background; a fresh brief costs nothing.
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
}

function SidebarFooter({ info }: { info: WorkspaceInfo | null }) {
  const [tour, setTour] = useState(false);
  useEffect(() => setTour(tourInSidebar()), []);
  return (
    <div className="mt-4 flex flex-col gap-1">
      {tour && (
        <button type="button" onClick={openTour} className="enter flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:bg-hover hover:text-ink">
          <Sparkles className="size-3.5 text-accent" strokeWidth={1.75} aria-hidden /> Take the tour
        </button>
      )}
      <AccountMenu info={info} placement="up" />
    </div>
  );
}

function Avatar({ letter, size }: { letter: string; size: "sm" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-accent font-[600] text-on-ink uppercase",
        size === "sm" ? "size-7 text-[12px]" : "size-9 text-[14px]",
      )}
    >
      {letter}
    </span>
  );
}

const ITEM = "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-left text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink";

/**
 * The account button at the foot of the sidebar opens a panel: who you are, your sources, the admin panel (admins
 * only), the tour, theme and sound, and sign out. Escape or a click outside closes it.
 */
function AccountMenu({ info, placement }: { info: WorkspaceInfo | null; placement: "up" | "down" }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  if (leaving) return <Interstitial label="Signing you out" note="See you soon." />;
  if (!user) return null;
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const name = user.fullName || email.split("@")[0];
  // The menu is as narrow as the sidebar (144px at its smallest): the row carries the count, the account button the workspace.
  const workspace = info ? (info.workspace === "demo" ? "Sample data" : "Your apps") : "";
  const up = placement === "up";
  const leave = () => {
    // Cover the app at once, then a full page load, so nothing of this account stays in memory or flashes on the way out.
    setLeaving(true);
    endTourOffer();
    void signOut()
      .catch(() => {})
      .finally(() => window.location.replace("/sign-in"));
  };

  return (
    <div ref={root} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Account"
            initial={{ opacity: 0, scale: 0.96, y: up ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: "spring", duration: 0.28, bounce: 0.12 }}
            style={{ transformOrigin: up ? "bottom center" : "top center" }}
            className={cn(
              "absolute inset-x-0 z-30 rounded-[14px] border border-line bg-surface p-1.5 shadow-[0_18px_44px_-18px_rgb(14_17_22/0.3)]",
              up ? "bottom-full mb-2" : "top-full mt-2",
            )}
          >
            <div className="flex items-center gap-2.5 px-2 pt-1.5 pb-2.5">
              <Avatar letter={name.charAt(0)} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-[550] text-ink">{name}</p>
                <p className="truncate text-[12px] text-muted" title={email}>
                  {email}
                </p>
              </div>
            </div>
            <div className="my-1 h-px bg-line" />
            <Link href="/connections" className={ITEM}>
              <Cable className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1 truncate">Sources</span>
              {info && (
                <span className="shrink-0 rounded-full border border-line px-1.5 text-[11.5px] font-[500] text-muted tabular-nums" title={`${workspace}, ${info.count} sources`}>
                  {info.count}
                </span>
              )}
            </Link>
            {info?.admin && (
              <Link href="/admin" className={ITEM}>
                <Shield className="size-4 text-muted" strokeWidth={1.75} aria-hidden />
                Admin panel
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openTour();
              }}
              className={ITEM}
            >
              <Sparkles className="size-4 text-muted" strokeWidth={1.75} aria-hidden />
              Take the tour
            </button>
            <div className="my-1 h-px bg-line" />
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[13px] text-ink-2">
              Theme <ThemeSwitch />
            </div>
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[13px] text-ink-2">
              Sounds <SoundSwitch />
            </div>
            <div className="my-1 h-px bg-line" />
            <button type="button" onClick={leave} className={cn(ITEM, "hover:bg-risk-soft hover:text-risk")}>
              <LogOut className="size-4" strokeWidth={1.75} aria-hidden />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="press flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left hover:bg-hover active:scale-[0.98] aria-expanded:bg-pressed"
      >
        <Avatar letter={name.charAt(0)} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-[550] text-ink">{name}</span>
          <span className="block truncate text-[11.5px] text-muted">{workspace || email}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-hair" strokeWidth={1.75} aria-hidden />
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
                        active ? "nav-active text-ink" : "text-muted hover:bg-hover hover:text-ink",
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
