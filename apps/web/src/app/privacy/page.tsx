import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Wordmark } from "@/components/shell";

export const metadata: Metadata = { title: "Privacy policy", description: "What Cortex keeps, who it shares it with, and how to delete it." };

const UPDATED = "9 November 2026";

/** Public, plain-language privacy policy (required by Google Play). Describes what the code actually does. */
export default function Privacy() {
  return (
    <main className="min-h-dvh bg-surface px-4 py-12 sm:px-6">
      <article className="mx-auto max-w-[680px] text-[15.5px] leading-[1.7] text-ink-2 [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:text-[17px] [&_h2]:font-[600] [&_h2]:text-ink [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
        <Link href="/" aria-label="Cortex home">
          <Wordmark />
        </Link>
        <h1 className="mt-10 text-[34px] font-[400] leading-[1.15] tracking-[-0.015em] text-ink">Privacy policy</h1>
        <p className="readout mt-3 text-muted">Last updated {UPDATED}</p>
        <p className="mt-6">
          Cortex answers questions from the apps you connect (Gmail, Google Calendar, Google Tasks, Drive, Notion, Slack, GitHub) and from files you upload, with every claim
          cited, and takes actions only after you approve them. This page explains what that involves for your data, on the website and in the Android app.
        </p>

        <h2>What Cortex keeps</h2>
        <ul>
          <li><b>Your account</b>: your email address and name, and a sign-in managed by Clerk. Cortex never sees your password.</li>
          <li><b>Your chats</b>: questions, answers and the source snippets they cite, so you can come back to them on any device.</li>
          <li><b>Files you upload</b>, and the text read from them so they can be searched.</li>
          <li><b>Memories</b>: priorities, preferences, people and decisions from your chats, each with the reason it was kept. Never passwords or codes. You can review, edit or delete them on the Memory page.</li>
          <li><b>Usage counts</b> (questions, searches, actions per day) to keep the free service within its limits, and a log of errors.</li>
          <li><b>Shared links</b> you create: a frozen copy of that one answer, until you turn the link off.</li>
        </ul>

        <h2>Your connected apps</h2>
        <p>
          When you connect an app you sign in with that app directly, through Composio, and grant it access. Cortex reads from the app only to answer the question you
          asked, and changes something (sends an email, creates an event or task) only after you approve that exact action on screen. Cortex does not copy your mailbox,
          calendar or documents; only the snippets an answer cites are saved with that chat. You can disconnect any app at any time on the Sources page.
        </p>

        <h2>Voice and the microphone</h2>
        <p>
          The Android app and the website ask for the microphone only when you use dictation or voice mode. Your recording is sent to a speech-to-text service to turn it
          into words and is not stored. Spoken answers are produced by a text-to-speech service from the answer text.
        </p>

        <h2>Who processes your data</h2>
        <p>To work, Cortex sends parts of your data to these services. None of them may use it to advertise to you, and Cortex never sells your data.</p>
        <ul>
          <li><b>Clerk</b>: sign-in and account security.</li>
          <li><b>Composio</b>: the connections to your apps, and the actions you approve.</li>
          <li><b>AI model providers</b> (such as Google Gemini, Groq, Cerebras and OpenRouter): your question and the evidence found for it, to write and check the answer.</li>
          <li><b>Speech services</b> (Sarvam AI, Groq, Google): voice recordings and spoken answers.</li>
          <li><b>Oracle Cloud</b>: searching your memories by meaning.</li>
          <li><b>Firecrawl</b>: web searches, when a question needs the public web.</li>
          <li><b>Amazon Web Services</b>: the server Cortex runs on, where its data is stored.</li>
        </ul>

        <h2>Deleting your data</h2>
        <p>
          You can delete single chats, files and memories at any time. To delete your whole account and everything above, use{" "}
          <Link href="/delete-account" className="text-accent-ink underline underline-offset-2">Delete account</Link> on the website, or <b>Delete account</b> in the app&rsquo;s
          account menu. It takes effect at once and cannot be undone.
        </p>

        <h2>Children</h2>
        <p>Cortex is not meant for children under 13 and does not knowingly collect their data.</p>

        <h2>Contact</h2>
        <p>
          Questions about your data or this policy:{" "}
          <Suspense fallback="the contact address on Cortex's Google Play listing">
            <Contact />
          </Suspense>
          .
        </p>
      </article>
    </main>
  );
}

/** The contact address, read when the page is served (CORTEX_CONTACT_EMAIL in the server's .env). */
async function Contact() {
  await connection();
  const contact = process.env.CORTEX_CONTACT_EMAIL;
  if (!contact) return <>the contact address on Cortex&rsquo;s Google Play listing</>;
  return (
    <a href={`mailto:${contact}`} className="text-accent-ink underline underline-offset-2">
      {contact}
    </a>
  );
}
