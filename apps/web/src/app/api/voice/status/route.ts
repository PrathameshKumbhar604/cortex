import { isLang } from "@/lib/voice";
import { session, unauthorized } from "@/server/cortex";
import { warmStt } from "@/server/stt";
import { voiceStatus } from "@/server/voice";

/** Can a new voice session start? `?warm=hi` also gets that language's speech model ready in the background. */
export async function GET(req: Request) {
  if (!(await session())) return unauthorized();
  const status = await voiceStatus();
  const warm = new URL(req.url).searchParams.get("warm");
  if (status.enabled && isLang(warm)) warmStt(warm);
  return Response.json(status);
}
