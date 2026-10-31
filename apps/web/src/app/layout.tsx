import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Shell } from "@/components/shell";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// The brand voice: a book serif for headings and the wordmark, over Geist for everything you read and use.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz", "SOFT"] });

export const metadata: Metadata = {
  title: { default: "Cortex", template: "%s · Cortex" },
  description: "Cited, verified answers from your Gmail, Calendar, Drive, Notion, Slack and GitHub.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3f0" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1917" },
  ],
};

// Runs before the first paint, so a saved light/dark choice never flashes the other theme.
const THEME_SCRIPT = `try{var t=localStorage.getItem("cortex.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${fraunces.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="h-full">
        <ClerkProvider>
          <Shell>{children}</Shell>
        </ClerkProvider>
      </body>
    </html>
  );
}
