import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { shares } from "@/server/shares";

export const alt = "A cited answer, shared from Cortex";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The link preview: the question, large, on Cortex's paper colour. Nothing else from the answer. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const snap = shares.get((await params).id);
  const q = snap ? (snap.question.length > 140 ? `${snap.question.slice(0, 139)}…` : snap.question) : "This link isn't available";
  const n = snap?.sources.length ?? 0;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f4f3f0", color: "#0e1116", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: "#5b47e0" }} />
          Cortex
        </div>
        <div style={{ fontSize: q.length > 80 ? 54 : 66, lineHeight: 1.15, letterSpacing: -1.5 }}>{q}</div>
        <div style={{ fontSize: 26, color: "#5f6672" }}>{snap ? (n ? `Answer with ${n} cited source${n > 1 ? "s" : ""}` : "Shared answer") : "Shared answer"}</div>
      </div>
    ),
    size,
  );
}
