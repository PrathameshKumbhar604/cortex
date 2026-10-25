import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Shell } from "@/components/shell";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Cortex", template: "%s · Cortex" },
  description: "Cited, verified answers from your Gmail, Calendar, Drive, Notion, Slack and GitHub.",
};

export const viewport: Viewport = { themeColor: "#f7f8fa" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} h-full`}>
      <body className="h-full">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
