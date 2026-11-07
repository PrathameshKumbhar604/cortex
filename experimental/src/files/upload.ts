import { postForm } from "@/api/multipart";

export const MAX_UPLOAD = 10 * 1024 * 1024;

export interface FileInfo {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  searchable: boolean;
}

export interface PickedFile {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

/** Uploads one file to /api/files (the web's route, unchanged); rejects with a message a person can act on. */
export async function uploadFile(file: PickedFile, onProgress?: (share: number) => void): Promise<FileInfo> {
  if ((file.size ?? 0) > MAX_UPLOAD) throw new Error(`${file.name} is over 10 MB. Try a smaller file.`);
  if (file.size === 0) throw new Error(`${file.name} is empty.`);
  const body = await postForm<{ file: FileInfo }>("/api/files", { file: { uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" } }, { onProgress });
  return body.file;
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
