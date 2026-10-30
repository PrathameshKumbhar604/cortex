import { jsonError, session, unauthorized, withinLimit } from "@/server/cortex";
import { listFiles, MAX_BYTES, saveFile } from "@/server/files";

export async function GET() {
  const sess = await session();
  if (!sess) return unauthorized();
  return Response.json({ files: await listFiles(sess.userId) });
}

/** One file per request, at most 10 MB. */
export async function POST(req: Request) {
  const sess = await session();
  if (!sess) return unauthorized();
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return jsonError("That file is over 10 MB. Try a smaller one.", 413);
  if (!withinLimit(`upload:${sess.userId}`, 20)) return jsonError("Too many uploads in a minute. Wait a few seconds and try again.", 429);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return jsonError("Choose a file to upload.");
  if (file.size > MAX_BYTES) return jsonError("That file is over 10 MB. Try a smaller one.", 413);
  try {
    return Response.json({ file: await saveFile(sess.userId, file) }, { status: 201 });
  } catch {
    return jsonError("Couldn't save the file. Try again.", 500);
  }
}
