export type WorkspaceId = "demo" | "live";

/** The workspace a request runs in: the cookie's choice, never "live" where connecting your own apps isn't allowed. */
export function chooseWorkspace(cookie: string | undefined, liveAllowed: boolean, fallback: WorkspaceId): WorkspaceId {
  const wanted = cookie === "demo" || cookie === "live" ? cookie : fallback;
  return wanted === "live" && !liveAllowed ? "demo" : wanted;
}

/**
 * The saved-brief key. A brief is only ever served to the same data id, in the same workspace, built from the same
 * connected sources: connecting or disconnecting an app, or switching workspace, lands on a different key.
 * v2: rows from before this key (built before per-user connections) are never served.
 */
export function briefKey(userId: string, workspace: WorkspaceId, connected: string[]): string {
  return `v2:${userId}:${workspace}:${[...connected].sort().join(",")}`;
}
