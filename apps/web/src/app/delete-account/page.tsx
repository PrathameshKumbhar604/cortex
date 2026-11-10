import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/shell";
import { DeleteAccount } from "@/components/delete-account";

export const metadata: Metadata = { title: "Delete your account", description: "How to delete your Cortex account and all its data." };

/** Public page (Google Play asks for a web address where people can delete their account): what is deleted, and the button. */
export default function DeleteAccountPage() {
  return (
    <main className="min-h-dvh bg-surface px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-[560px] text-[15.5px] leading-[1.7] text-ink-2">
        <Link href="/" aria-label="Cortex home">
          <Wordmark />
        </Link>
        <h1 className="mt-10 text-[34px] font-[400] leading-[1.15] tracking-[-0.015em] text-ink">Delete your account</h1>
        <p className="mt-4">Deleting your Cortex account removes, at once and for good:</p>
        <ul className="mt-2 list-disc pl-5 [&_li]:mt-1">
          <li>your sign-in, email address and name</li>
          <li>all your chats and shared links</li>
          <li>your uploaded files</li>
          <li>everything Cortex remembers about you</li>
          <li>your connections to Gmail, Calendar, Tasks, Drive, Notion, Slack and GitHub</li>
          <li>your usage history</li>
        </ul>
        <p className="mt-4">Nothing is kept afterwards. Error logs that mention your email are removed as they age out.</p>
        <p className="mt-4">
          In the Android app: open the menu, tap your name, then <b>Privacy and data</b>, then <b>Delete account</b>. On the web: sign in, then use the button below.
        </p>
        <div className="mt-8">
          <DeleteAccount />
        </div>
        <p className="mt-10 text-[13px] text-muted">
          See also the <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link>.
        </p>
      </div>
    </main>
  );
}
