"use client";

export const MAX_UPLOAD = 10 * 1024 * 1024;

export interface FileInfo {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  searchable: boolean;
}

/** Uploads one file; rejects with a message a person can act on. */
export async function uploadFile(file: File): Promise<FileInfo> {
  if (file.size > MAX_UPLOAD) throw new Error(`${file.name} is over 10 MB. Try a smaller file.`);
  if (file.size === 0) throw new Error(`${file.name} is empty.`);
  const form = new FormData();
  form.set("file", file);
  const res = await fetch("/api/files", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { file?: FileInfo; error?: string };
  if (!res.ok || !body.file) throw new Error(body.error ?? "Couldn't upload that file. Try again.");
  return body.file;
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
