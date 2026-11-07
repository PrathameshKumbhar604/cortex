import { API_URL } from "@/config";
import { prefs } from "@/storage";
import { getAuthToken } from "./client";

/**
 * POSTs multipart form data with a file given by its uri (uploads, recorded audio). React Native's XMLHttpRequest sends
 * `{ uri, name, type }` parts natively, which the streaming fetch doesn't; it also reports upload progress.
 */
export async function postForm<T>(path: string, fields: Record<string, string | { uri: string; name: string; type: string }>, opts: { onProgress?: (share: number) => void; timeoutMs?: number } = {}): Promise<T> {
  const token = await getAuthToken();
  const ws = prefs.getString("cortex.workspace");
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v as unknown as Blob);
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API_URL + path);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (ws) xhr.setRequestHeader("Cookie", `cortex_ws=${ws}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: (T & { error?: string }) | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status < 300 && body) resolve(body);
      else reject(Object.assign(new Error(body?.error ?? `Cortex answered with an error (${xhr.status}).`), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error(`Can't reach Cortex at ${API_URL}.`));
    xhr.timeout = opts.timeoutMs ?? 120_000;
    xhr.ontimeout = () => reject(new Error("That took too long. Check your connection and try again."));
    xhr.send(form);
  });
}
