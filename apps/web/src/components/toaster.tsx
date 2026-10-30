"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Info, TriangleAlert, X } from "lucide-react";
import { dismiss, onToasts, toast, type Toast } from "@/lib/toast";
import { cn } from "@/lib/ui";

/** Bottom-right stack of passing notices; also tells the person when the connection drops and comes back. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => onToasts(setItems), []);
  useEffect(() => {
    let offline: number | null = null;
    const down = () => {
      offline = toast("You're offline", { body: "Cortex will work again as soon as you're back online.", tone: "warn", ms: 60_000 });
    };
    const up = () => {
      if (offline) dismiss(offline);
      toast("Back online");
    };
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    return () => {
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
    };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={{ opacity: 0, transform: "translateY(4px) scale(0.98)", transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="pointer-events-auto flex items-start gap-2.5 rounded-[12px] border border-line bg-surface px-3.5 py-3 shadow-[0_12px_32px_-16px_rgb(14_17_22/0.3)]"
          >
            {t.tone === "warn" ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className={cn("text-[13.5px] font-[550] text-ink")}>{t.title}</p>
              {t.body && <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.body}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="grid size-6 shrink-0 place-items-center rounded-md text-hair hover:bg-hover hover:text-ink">
              <X className="size-3.5" aria-hidden />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
