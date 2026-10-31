"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { formatSize, uploadFile, type FileInfo } from "@/lib/files";
import { cn, relativeDays } from "@/lib/ui";
import { toast } from "@/lib/toast";

export function FilesView() {
  const [files, setFiles] = useState<FileInfo[] | null>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/files");
    const body = (await res.json().catch(() => ({}))) as { files?: FileInfo[]; error?: string };
    if (!res.ok) toast("Couldn't load your files", { body: body.error, tone: "warn" });
    setFiles(body.files ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (picked: File[]) => {
    setUploading((u) => [...u, ...picked.map((f) => f.name)]);
    const results = await Promise.allSettled(picked.map(uploadFile));
    setUploading((u) => u.filter((n) => !picked.some((f) => f.name === n)));
    results.forEach((r, i) =>
      r.status === "rejected" ? toast(`Couldn't upload ${picked[i].name}`, { body: (r.reason as Error).message, tone: "warn", ms: 8000 }) : toast(`${picked[i].name} uploaded`),
    );
    await load();
  };

  const remove = async (id: string) => {
    setConfirm(null);
    setFiles((all) => all?.filter((f) => f.id !== id) ?? null);
    const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      toast("Couldn't delete that file", { body: "Try again in a moment.", tone: "warn" });
      await load();
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-4 pt-10 pb-16 sm:px-6 md:pt-16">
        <h1 className="text-[32px] font-[400] leading-[1.15] tracking-[-0.015em] text-ink sm:text-[40px]">Your files</h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted">
          Upload documents for Cortex to read. They become a source like your connected apps: Cortex searches them when they are relevant and cites
          them in answers. You can also attach a file to one question with the paperclip. Up to 10 MB each, visible only to you.
        </p>

        <div
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) void add([...e.dataTransfer.files]);
          }}
          className={cn(
            "mt-8 flex flex-col items-center gap-2 rounded-[14px] border border-dashed px-6 py-9 text-center transition-colors",
            dragging ? "border-accent bg-accent-wash" : "border-line-strong",
          )}
        >
          <Upload className={cn("size-5 transition-colors", dragging ? "text-accent" : "text-hair")} aria-hidden />
          <p className="text-[14.5px] text-ink-2">Drop files here, or</p>
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="rounded-[10px] bg-ink px-3.5 py-1.5 text-[13.5px] font-[550] text-on-ink hover:bg-ink-2"
          >
            Choose files
          </button>
          <p className="text-[12.5px] text-muted">PDF, text, Markdown, CSV, JSON or code are searchable. Other files are stored but not read.</p>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void add([...e.target.files]);
              e.target.value = "";
            }}
          />
        </div>

        <ul className="mt-10 border-t border-ink">
          {uploading.map((name) => (
            <li key={`up-${name}`} className="enter flex items-center gap-3 border-b border-line py-3.5 text-[14.5px] text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {name}
            </li>
          ))}
          {(files ?? []).map((f, i) => (
            <li key={f.id} className="rise grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line py-3.5" style={{ "--i": i } as React.CSSProperties}>
              <FileText className="size-4 text-hair" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-[14.5px] font-[500] text-ink">{f.name}</p>
                <p className="text-[12.5px] text-muted">
                  {formatSize(f.size)} · added {relativeDays(f.createdAt)} · {f.searchable ? "searchable" : "stored only (no text to read)"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${f.name}`} title="Open" className="grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink">
                  <Download className="size-4" aria-hidden />
                </a>
                {confirm === f.id ? (
                  <button type="button" onClick={() => remove(f.id)} onBlur={() => setConfirm(null)} autoFocus className="rounded-md bg-risk px-2.5 py-1 text-[12.5px] font-[550] text-on-ink">
                    Delete for good
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirm(f.id)} aria-label={`Delete ${f.name}`} title="Delete" className="grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-risk">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            </li>
          ))}
          {files && files.length === 0 && uploading.length === 0 && (
            <li className="border-b border-line py-6 text-[14.5px] text-muted">
              No files yet. Upload a syllabus, a spec or meeting notes, then ask about it on the{" "}
              <Link href="/" className="text-accent-ink underline underline-offset-2">
                Ask
              </Link>{" "}
              page.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
