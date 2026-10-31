import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { SharedAnswer } from "@/components/ask/shared-answer";
import { Wordmark } from "@/components/shell";
import { appOrigin, shares } from "@/server/shares";

// Blocking on the server is right here: link-preview bots and readers get the whole snapshot in the first response.
export const instant = false;

const robots = { index: false, follow: false, googleBot: { index: false, follow: false } };

async function load(params: PageProps<"/s/[id]">["params"]) {
  await connection(); // read per request: a revoked link must stop working at once
  return shares.get((await params).id);
}

/** Plain text for link previews: no markdown or citation markers. */
const plain = (md: string) => md.replace(/```[\s\S]*?```/g, " ").replace(/\s*\[(\d+)\]/g, "").replace(/[*_`~]+/g, "").replace(/[#>|]+|^\s*-\s/gm, " ").replace(/\s+/g, " ").trim();

export async function generateMetadata({ params }: PageProps<"/s/[id]">): Promise<Metadata> {
  const snap = await load(params);
  if (!snap) return { title: "Link not available", robots };
  const title = snap.question.length > 90 ? `${snap.question.slice(0, 89)}…` : snap.question;
  const text = plain(snap.answer);
  const description = text.length > 200 ? `${text.slice(0, 199)}…` : text;
  return {
    metadataBase: new URL(appOrigin(await headers())),
    title,
    description,
    robots,
    referrer: "no-referrer",
    openGraph: { title, description, type: "article", siteName: "Cortex" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function SharedPage({ params }: PageProps<"/s/[id]">) {
  return (
    <div className="min-h-dvh bg-shell">
      <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-10 flex items-center justify-between">
          <Link href="/" aria-label="Cortex home">
            <Wordmark />
          </Link>
          <span className="readout text-muted">Shared answer</span>
        </header>
        <Snapshot params={params} />
        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[13px] text-muted">
          <span>
            Made with{" "}
            <Link href="/" className="text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink">
              Cortex
            </Link>
          </span>
          <span>Cited answers from your own apps.</span>
        </footer>
      </main>
    </div>
  );
}

async function Snapshot({ params }: { params: PageProps<"/s/[id]">["params"] }) {
  const snap = await load(params);
  if (!snap)
    return (
      <section className="mb-16">
        <h1 className="text-[30px] font-[300] leading-[1.15] tracking-[-0.035em] text-ink">This link isn&apos;t available</h1>
        <p className="mt-3 text-[15px] text-ink-2">The person who shared it may have turned it off, or the address is incomplete.</p>
      </section>
    );
  const date = new Date(snap.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return (
    <article className="mb-16">
      <h1 className="mb-3 text-balance text-[30px] font-[300] leading-[1.15] tracking-[-0.035em] text-ink sm:text-[38px]">{snap.question}</h1>
      <p className="readout mb-6 text-muted">Shared {date} · a snapshot, it won&apos;t change</p>
      <SharedAnswer answer={snap.answer} sources={snap.sources} />
    </article>
  );
}
