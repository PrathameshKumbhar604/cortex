"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Brain, Check, FileText, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/ui";
import { SourceMark } from "./ask/sources";

const SEEN = "cortex.tour"; // "done" or "skipped"
const OPEN_EVENT = "cortex:tour";

/** Opens the walkthrough from anywhere (the sidebar's "Take the tour"). */
export function openTour() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const STEPS: { title: string; body: string; demo: () => React.ReactNode }[] = [
  {
    title: "Ask about your work",
    body: "Ask about your emails, meetings, files or projects in plain words. Fast answers in one pass; Deep plans, searches your apps side by side and checks every claim.",
    demo: () => (
      <div className="rounded-[12px] border border-line-strong bg-surface p-3 shadow-[0_8px_24px_-12px_rgb(14_17_22/0.14)]">
        <p className="text-[14px] text-ink">What&apos;s due this week, and what&apos;s at risk?</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="rounded-md bg-shell px-2 py-0.5 text-[12px] text-ink-2">Deep</span>
          <span className="grid size-7 place-items-center rounded-full bg-accent text-on-ink">
            <ArrowUp className="size-3.5" aria-hidden />
          </span>
        </div>
      </div>
    ),
  },
  {
    title: "Every claim shows its source",
    body: "Small numbers link each sentence to the email, file or message it came from. Cortex checks each one and says how many it could verify. Anything not in your sources is labelled as such.",
    demo: () => (
      <div className="rounded-[12px] border border-line bg-surface p-4 text-[14.5px] leading-relaxed text-ink">
        The demo moved to November 14
        <span className="ml-0.5 inline-flex -translate-y-1 items-center gap-0.5 font-mono text-[11px] text-accent-ink">
          <SourceMark source="slack" />1
        </span>
        , but the milestone still says the 12th
        <span className="ml-0.5 inline-flex -translate-y-1 items-center gap-0.5 font-mono text-[11px] text-accent-ink">
          <SourceMark source="github" />2
        </span>
        .
        <p className="readout mt-3 flex items-center gap-1 text-accent-ink">
          <Check className="size-3" aria-hidden /> Verified 2/2
        </p>
      </div>
    ),
  },
  {
    title: "Nothing happens without you",
    body: "Ask Cortex to send an email or create an event and it drafts it on a card. Edit it if you like, then approve. Nothing is sent until you do.",
    demo: () => (
      <div className="rounded-[12px] border border-line-strong bg-surface p-4">
        <p className="text-[13.5px] font-[550] text-ink">Email Priya the new demo date</p>
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
          <SourceMark source="gmail" /> Gmail · Needs your approval
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <span className="rounded-md border border-line-strong px-2.5 py-1 text-[12.5px] text-ink">Decline</span>
          <span className="rounded-md bg-ink px-2.5 py-1 text-[12.5px] text-on-ink">Approve & send</span>
        </div>
      </div>
    ),
  },
  {
    title: "It remembers what matters",
    body: "Priorities, people and preferences you mention are kept, never passwords or small talk. Review, pin, edit or forget them on the Memory page.",
    demo: () => (
      <div className="flex flex-col gap-2">
        {["Orbit is the top priority this quarter", "Manager is Priya Shah", "Prefers short answers"].map((m, i) => (
          <p key={m} className="rise flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13.5px] text-ink-2" style={{ "--i": i + 2 } as React.CSSProperties}>
            <Brain className="size-3.5 text-accent" aria-hidden /> {m}
          </p>
        ))}
      </div>
    ),
  },
  {
    title: "Bring in your apps and files",
    body: "Connect Gmail, Calendar, Drive, Notion, Slack or GitHub, or upload files of up to 10 MB. Cortex only reads to answer, and acts only when you approve.",
    demo: () => (
      <div className="grid grid-cols-2 gap-2">
        {(["gmail", "calendar", "drive", "slack"] as const).map((s) => (
          <span key={s} className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] text-ink-2 capitalize">
            <SourceMark source={s} /> {s}
          </span>
        ))}
        <span className="col-span-2 flex items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3 py-2 text-[13px] text-muted">
          <FileText className="size-3.5" aria-hidden /> syllabus.pdf · 1.2 MB
        </span>
      </div>
    ),
  },
];

/**
 * Optional first-run walkthrough. Offered once on the Ask page (never forced); skippable at any step and replayable
 * from the sidebar. Five short steps, each with a small live example of the thing it describes.
 */
export function Tour() {
  const path = usePathname();
  const [offer, setOffer] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

  useEffect(() => {
    const show = () => {
      setOffer(false);
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);
  useEffect(() => {
    if (path !== "/") return;
    try {
      if (!localStorage.getItem(SEEN)) {
        const t = setTimeout(() => setOffer(true), 1200); // after the page settles, not on top of it
        return () => clearTimeout(t);
      }
    } catch {}
  }, [path]);

  const close = (how: "done" | "skipped") => {
    setOpen(false);
    setOffer(false);
    try {
      localStorage.setItem(SEEN, how);
    } catch {}
  };
  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setStep(to);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("skipped");
      if (e.key === "ArrowRight" && step < STEPS.length - 1) go(step + 1);
      if (e.key === "ArrowLeft" && step > 0) go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const s = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <>
      <AnimatePresence>
        {offer && !open && (
          <motion.div
            role="dialog"
            aria-label="Take the tour"
            initial={{ opacity: 0, transform: "translateY(12px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transform: "translateY(8px)", transition: { duration: 0.15 } }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="fixed right-4 bottom-28 z-40 w-[min(340px,calc(100vw-32px))] rounded-[14px] border border-line bg-surface p-4 shadow-[0_16px_40px_-16px_rgb(14_17_22/0.3)] sm:right-6"
          >
            <p className="flex items-center gap-2 text-[14.5px] font-[600] text-ink">
              <Sparkles className="size-4 text-accent" aria-hidden /> New to Cortex?
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">A one-minute tour of asking, sources, approvals and memory.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => close("skipped")} className="rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:text-ink">
                No thanks
              </button>
              <button type="button" onClick={() => setOpen(true)} className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-[550] text-on-ink hover:bg-ink-2">
                Show me
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center bg-[rgb(14_17_22/0.4)] px-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            onClick={(e) => e.target === e.currentTarget && close("skipped")}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="tour-title"
              initial={{ opacity: 0, transform: "scale(0.96)" }}
              animate={{ opacity: 1, transform: "scale(1)" }}
              exit={{ opacity: 0, transform: "scale(0.98)", transition: { duration: 0.15 } }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="w-full max-w-[460px] overflow-hidden rounded-[18px] border border-line bg-surface shadow-[0_24px_64px_-24px_rgb(14_17_22/0.45)]"
            >
              <div className="flex items-center justify-between px-5 pt-4">
                <span className="readout text-muted">
                  {step + 1} / {STEPS.length}
                </span>
                <button type="button" onClick={() => close("skipped")} aria-label="Close the tour" className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink">
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <div className="relative min-h-[300px] px-5 pt-3 pb-1">
                <AnimatePresence mode="wait" initial={false} custom={dir}>
                  <motion.div
                    key={step}
                    custom={dir}
                    initial={{ opacity: 0, transform: `translateX(${dir * 16}px)` }}
                    animate={{ opacity: 1, transform: "translateX(0px)" }}
                    exit={{ opacity: 0, transform: `translateX(${dir * -12}px)`, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <div className="rounded-[14px] bg-shell p-5">{s.demo()}</div>
                    <h2 id="tour-title" className="mt-5 text-[19px] font-[500] tracking-[-0.015em] text-ink">
                      {s.title}
                    </h2>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{s.body}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-5">
                <div className="flex gap-1.5" aria-hidden>
                  {STEPS.map((_, i) => (
                    <span key={i} className={cn("h-1.5 rounded-full transition-[width,background-color] duration-200", i === step ? "w-4 bg-accent" : "w-1.5 bg-line-strong")} />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {step > 0 ? (
                    <button type="button" onClick={() => go(step - 1)} className="rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:text-ink">
                      Back
                    </button>
                  ) : (
                    <button type="button" onClick={() => close("skipped")} className="rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:text-ink">
                      Skip
                    </button>
                  )}
                  {last ? (
                    <Link href="/connections" onClick={() => close("done")} className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-[550] text-on-ink hover:bg-ink-2">
                      Connect apps
                    </Link>
                  ) : (
                    <button type="button" autoFocus onClick={() => go(step + 1)} className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-[550] text-on-ink hover:bg-ink-2">
                      Next
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
