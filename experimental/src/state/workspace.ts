import { useEffect, useSyncExternalStore } from "react";
import type { ConnectorStatus } from "@cortex/shared";
import { api } from "@/api/client";
import { loadBrief } from "@/brief/seen";
import { prefs } from "@/storage";

// What /api/connections says about this account: Sample or Live, whether it's an admin, and every source's status.
export interface WorkspaceInfo {
  workspace: "demo" | "live";
  liveAvailable: boolean;
  admin: boolean;
  defaultWorkspace: "demo" | "live";
  connectors: ConnectorStatus[];
}

let info: WorkspaceInfo | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export async function refreshWorkspace(): Promise<WorkspaceInfo | null> {
  loading ??= api<WorkspaceInfo>("/api/connections")
    .then((v) => {
      info = v;
      prefs.set("cortex.workspace", v.workspace);
      emit();
    })
    .catch(() => {})
    .finally(() => (loading = null));
  await loading;
  return info;
}

export async function switchWorkspace(workspace: "demo" | "live") {
  await api("/api/connections", { method: "PUT", json: { workspace } });
  prefs.set("cortex.workspace", workspace);
  await refreshWorkspace();
  void loadBrief(); // the brief belongs to the workspace
}

export function useWorkspace() {
  const v = useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => info,
  );
  useEffect(() => {
    if (!info) void refreshWorkspace();
  }, []);
  return v;
}
