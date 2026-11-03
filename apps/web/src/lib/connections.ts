// One shared /api/connections read for the sidebar and the Connections page: the sidebar refreshes it on every page
// change, so by the time someone opens Connections the list is already here and the page renders at once.
let last: unknown = null;
let inflight: Promise<unknown> | null = null;

export function fetchConnections<T>(): Promise<T | null> {
  inflight ??= fetch("/api/connections")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d ? (last = d) : d))
    .finally(() => (inflight = null));
  return inflight as Promise<T | null>;
}

/** The latest list this tab has seen; null before the first read (and always on the server). */
export const cachedConnections = <T>() => (typeof window === "undefined" ? null : (last as T | null));
