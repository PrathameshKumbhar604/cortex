import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ActionProposal } from "@cortex/shared";
import { api, streamSSE } from "@/api/client";
import { createAgent } from "@/agent/agent";
import { createChatStore, type SavedThread } from "@/chats/store";
import { prefs } from "@/storage";
import { resetBrief } from "@/brief/seen";
import { framedSubscribe } from "./framed";
import { resetWorkspace } from "./workspace";

// The app's two long-lived stores: the chat list (per account, synced with /api/chats) and the open conversation.
export const chats = createChatStore({
  read: (k) => AsyncStorage.getItem(k),
  write: (k, v) => AsyncStorage.setItem(k, v),
  remove: (k) => AsyncStorage.removeItem(k),
  remote: {
    list: async () => (await api<{ chats: SavedThread[] }>("/api/chats")).chats,
    put: (t) => api("/api/chats", { method: "PUT", json: t }),
    remove: (id) => api(`/api/chats?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
});

export const agent = createAgent({
  stream: streamSSE,
  useOtherChats: () => prefs.getBool("cortex.useOtherChats", false),
  decideAction: (id, body) => api<{ proposal?: ActionProposal; error?: string }>(`/api/actions/${id}`, { method: "POST", json: body, timeoutMs: 60_000 }),
});

/**
 * Signed out or account deleted: nothing of that person stays on the phone (chats, brief, their starter questions).
 * Device settings (theme, haptics, voice) stay.
 */
export async function forgetAccount() {
  agent.load();
  for (const k of ["cortex.workspace", "cortex.starters.demo", "cortex.starters.live", "cortex.brief.seen", "cortex.brief.pick"]) prefs.delete(k);
  resetBrief();
  resetWorkspace();
  await chats.close();
}

const agentFramed = framedSubscribe(agent.subscribe);

export const useChats = () => useSyncExternalStore(chats.subscribe, chats.list);
/** The open conversation, re-rendered at most once per frame while it streams. */
export const useAgentState = () => useSyncExternalStore(agentFramed, agent.get);
