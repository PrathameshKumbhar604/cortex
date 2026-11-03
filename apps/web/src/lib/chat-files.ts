type Saved = { attachments?: { id?: unknown }[]; versions?: (Saved | null)[] };

/** Ids of every file attached anywhere in a saved chat, including other versions of a turn. */
export function attachmentIds(chat: { turns?: unknown }): string[] {
  const out: string[] = [];
  const walk = (t: Saved | null) => {
    for (const a of t?.attachments ?? []) if (typeof a?.id === "string") out.push(a.id);
    for (const v of t?.versions ?? []) walk(v);
  };
  for (const t of Array.isArray(chat.turns) ? (chat.turns as Saved[]) : []) walk(t);
  return [...new Set(out)];
}
