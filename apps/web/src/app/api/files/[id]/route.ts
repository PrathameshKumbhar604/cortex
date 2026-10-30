import { jsonError, session, unauthorized } from "@/server/cortex";
import { deleteFile, readStoredFile } from "@/server/files";

// Types safe to show in the browser; everything else downloads, so an uploaded HTML or SVG file can never run here.
const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"]);

export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const sess = await session();
  if (!sess) return unauthorized();
  const found = await readStoredFile(sess.userId, id);
  if (!found) return jsonError("File not found.", 404);
  const { file, bytes } = found;
  const inline = INLINE.has(file.type);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": inline ? file.type : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "cache-control": "private, max-age=0",
    },
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const sess = await session();
  if (!sess) return unauthorized();
  return (await deleteFile(sess.userId, id)) ? new Response(null, { status: 204 }) : jsonError("File not found.", 404);
}
