/** Splits a server-sent-events buffer into complete JSON events; `rest` is the unfinished tail to prepend to the next chunk. */
export function parseSSE(buffer: string): { events: unknown[]; rest: string } {
  const text = buffer.replace(/\r\n/g, "\n");
  const blocks = text.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: unknown[] = [];
  for (const block of blocks) {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      // a malformed event is dropped; the stream goes on
    }
  }
  return { events, rest };
}
