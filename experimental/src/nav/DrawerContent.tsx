import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import type { DrawerContentComponentProps } from "expo-router/drawer";
import { useUser } from "@clerk/expo";
import { ChevronsUpDown, FolderOpen, Newspaper, Pin, Search, SquarePen, X } from "@/ui/icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api/client";
import { haptic } from "@/haptics";
import { keywordSearch, mergeHits, type ChatHit, type Part, type SemanticMatch } from "@/lib/chat-search";
import { chats, useChats } from "@/state";
import { useWorkspace } from "@/state/workspace";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { Press, Txt, Wordmark } from "@/ui/primitives";
import { AccountSheet } from "./AccountSheet";
import { ChatActions } from "./ChatActions";

/** The drawer: new chat, search, Brief and Files, pinned and recent chats, and the account at the foot. */
export function DrawerContent(props: DrawerContentComponentProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const list = useChats();
  const path = usePathname();
  const { t: openId } = useGlobalSearchParams<{ t?: string }>();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [account, setAccount] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const hits = useChatSearch(query);

  const go = (href: Parameters<typeof router.navigate>[0]) => {
    haptic.tap();
    props.navigation.closeDrawer();
    router.navigate(href);
  };
  const openChat = (id: string) => go({ pathname: "/", params: { t: id } });

  const pinned = list.filter((t) => t.pinned);
  const recent = list.filter((t) => !t.pinned);

  return (
    <View style={{ flex: 1, backgroundColor: c.shell, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 18, paddingRight: 8, height: 48 }}>
        <Wordmark size={22} />
        <Press accessibilityLabel="New chat" onPress={() => go({ pathname: "/", params: { t: "new" } })} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <SquarePen size={20} color={c.ink2} strokeWidth={1.75} />
        </Press>
      </View>

      {/* Search sits on top, like the AI apps: type to filter chats by words, and by meaning when the server can. */}
      <View style={{ marginHorizontal: 12, marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: searching ? c.surface : c.hover, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, borderWidth: 1, borderColor: searching ? c.accent : "transparent" }}>
        <Search size={16} color={c.muted} strokeWidth={1.75} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setSearching(true)}
          onBlur={() => setSearching(false)}
          placeholder="Search chats"
          placeholderTextColor={c.hair}
          cursorColor={c.accent}
          selectionColor={c.accent}
          returnKeyType="search"
          accessibilityLabel="Search chats"
          style={{ flex: 1, fontFamily: font.sans, fontSize: 15, color: c.ink, paddingVertical: 8 }}
        />
        {!!query && (
          <Press accessibilityLabel="Clear search" onPress={() => setQuery("")} style={{ padding: 6 }}>
            <X size={16} color={c.muted} />
          </Press>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 10, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        {query.trim() ? (
          <>
            <Label text={hits.length ? `${hits.length} found` : "No chats match"} />
            {hits.map((h) => (
              <Pressable key={h.id} onPress={() => openChat(h.id)} android_ripple={{ color: c.pressed }} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 }}>
                <Highlighted parts={h.title} variant="item" />
                <Highlighted parts={h.snippet} variant="note" lines={2} />
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <NavRow icon={<Newspaper size={18} color={c.muted} strokeWidth={1.75} />} label="Brief" active={path === "/brief"} onPress={() => go("/brief")} />
            <NavRow icon={<FolderOpen size={18} color={c.muted} strokeWidth={1.75} />} label="Files" active={path === "/files"} onPress={() => go("/files")} />
            {pinned.length > 0 && <Label text="Pinned" />}
            {pinned.map((t) => (
              <ChatRow key={t.id} title={t.title} pinned active={path === "/" && openId === t.id} onPress={() => openChat(t.id)} onLongPress={() => setMenuFor(t.id)} />
            ))}
            {recent.length > 0 && <Label text="Recent" />}
            {recent.map((t) => (
              <ChatRow key={t.id} title={t.title} active={path === "/" && openId === t.id} onPress={() => openChat(t.id)} onLongPress={() => setMenuFor(t.id)} />
            ))}
            {list.length === 0 && (
              <Txt variant="note" tone="hair" style={{ paddingHorizontal: 12, paddingTop: 20 }}>
                Your chats will show up here.
              </Txt>
            )}
          </>
        )}
      </ScrollView>

      <AccountRow onPress={() => setAccount(true)} />
      <AccountSheet open={account} onClose={() => setAccount(false)} onNavigate={(href) => (setAccount(false), go(href))} />
      <ChatActions id={menuFor} onClose={() => setMenuFor(null)} onDeleted={(id) => openId === id && router.setParams({ t: "new" })} />
    </View>
  );
}

function Label({ text }: { text: string }) {
  return (
    <Txt variant="readout" tone="hair" style={{ paddingHorizontal: 12, paddingTop: 18, paddingBottom: 6 }}>
      {text}
    </Txt>
  );
}

function NavRow({ icon, label, active, onPress }: { icon: React.ReactNode; label: string; active: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      android_ripple={{ color: c.pressed }}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46, paddingHorizontal: 12, borderRadius: 10, backgroundColor: active ? c.navActive : "transparent" }}
    >
      {icon}
      <Txt variant="item" tone={active ? "ink" : "ink2"} style={active ? { fontFamily: font.sans550 } : undefined}>
        {label}
      </Txt>
    </Pressable>
  );
}

function ChatRow({ title, pinned, active, onPress, onLongPress }: { title: string; pinned?: boolean; active: boolean; onPress: () => void; onLongPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => (haptic.tap(), onLongPress())}
      delayLongPress={350}
      accessibilityRole="link"
      accessibilityHint="Long press for pin, rename and delete"
      android_ripple={{ color: c.pressed }}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: active ? c.navActive : "transparent" }}
    >
      <Txt variant="small" tone={active ? "ink" : "ink2"} numberOfLines={1} style={{ flex: 1, fontSize: 14.5, fontFamily: active ? font.sans550 : font.sans }}>
        {title}
      </Txt>
      {pinned && <Pin size={13} color={c.hair} strokeWidth={1.75} />}
    </Pressable>
  );
}

function Highlighted({ parts, variant, lines = 1 }: { parts: Part[]; variant: "item" | "note"; lines?: number }) {
  const { c } = useTheme();
  return (
    <Txt variant={variant} tone={variant === "item" ? "ink" : "muted"} numberOfLines={lines} style={variant === "item" ? { fontSize: 14.5 } : { marginTop: 2 }}>
      {parts.map((p, i) => (
        <Txt key={i} variant={variant} style={[variant === "item" ? { fontSize: 14.5 } : null, { color: p.hit ? c.accentInk : undefined, backgroundColor: p.hit ? c.accentSoft : undefined }]}>
          {p.text}
        </Txt>
      ))}
    </Txt>
  );
}

function AccountRow({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  const { user } = useUser();
  const info = useWorkspace();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName || email.split("@")[0] || "You";
  const ws = info ? (info.workspace === "demo" ? "Sample data" : "Your apps") : email;
  return (
    <Press accessibilityLabel="Account menu" onPress={onPress} style={{ marginHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12 }}>
      <Avatar letter={name.charAt(0)} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="small" numberOfLines={1} style={{ fontFamily: font.sans550 }}>
          {name}
        </Txt>
        <Txt variant="note" tone="muted" numberOfLines={1}>
          {ws}
        </Txt>
      </View>
      <ChevronsUpDown size={15} color={c.hair} strokeWidth={1.75} />
    </Press>
  );
}

export function Avatar({ letter, size = 32 }: { letter: string; size?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" }}>
      <Txt variant="small" style={{ color: c.onInk, fontFamily: font.sansSemi, fontSize: size * 0.42, lineHeight: size * 0.5, textTransform: "uppercase" }}>
        {letter}
      </Txt>
    </View>
  );
}

/** Words first (instant, on the phone), then meaning from the server when it's set up, merged like the web. */
function useChatSearch(query: string): ChatHit[] {
  const list = useChats();
  const [semantic, setSemantic] = useState<SemanticMatch[]>([]);
  const seq = useRef(0);
  const searchable = useMemo(() => list.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt, turns: t.turns.map((x) => ({ question: x.question, answer: x.answer })) })), [list]);
  useEffect(() => {
    const q = query.trim();
    setSemantic([]);
    if (q.length < 3) return;
    const n = ++seq.current;
    const timer = setTimeout(() => {
      api<{ matches: SemanticMatch[] }>("/api/chats/search", { method: "POST", json: { q, ids: chats.list().map((t) => t.id) } })
        .then((r) => n === seq.current && setSemantic(r.matches))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  return useMemo(() => (query.trim() ? mergeHits(keywordSearch(searchable, query), semantic, searchable) : []), [query, semantic, searchable]);
}
