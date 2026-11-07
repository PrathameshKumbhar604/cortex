import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ActionProposal } from "@cortex/shared";
import { api, streamSSE } from "@/api/client";
import { createAgent } from "@/agent/agent";
import { createChatStore, type SavedThread } from "@/chats/store";
import { prefs } from "@/storage";
import { framedSubscribe } from "./framed";

// The app's two long-lived stores: the chat list (per account, synced with /api/chats) and the open conversation.
export const chats = createChatStore({
  read: (k) => AsyncStorage.getItem(k),
  write: (k, v) => AsyncStorage.setItem(k, v),
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

const agentFramed = framedSubscribe(agent.subscribe);

export const useChats = () => useSyncExternalStore(chats.subscribe, chats.list);
/** The open conversation, re-rendered at most once per frame while it streams. */
export const useAgentState = () => useSyncExternalStore(agentFramed, agent.get);
