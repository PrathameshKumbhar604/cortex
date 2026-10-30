import { Wordmark } from "./shell";

/** Full-screen hand-off between signed-in and signed-out: the sign-in panel's glow and dots, the wordmark, a sweep. */
export function Interstitial({ label, note }: { label: string; note?: string }) {
  return (
    <div role="status" aria-live="polite" className="interstitial promo-panel fixed inset-0 z-50 grid place-items-center overflow-hidden bg-shell">
      <div aria-hidden className="promo-dots absolute inset-0" />
      <div aria-hidden className="promo-glow absolute top-1/2 left-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <div className="relative flex flex-col items-center gap-5">
        <span className="breathe">
          <Wordmark />
        </span>
        <div aria-hidden className="h-[2px] w-40 overflow-hidden rounded-full bg-line">
          <div className="sweep h-full w-1/3 rounded-full bg-accent" />
        </div>
        <div className="text-center">
          <p className="text-[15px] text-ink">{label}</p>
          {note && <p className="mt-1 text-[13px] text-muted">{note}</p>}
        </div>
      </div>
    </div>
  );
}
